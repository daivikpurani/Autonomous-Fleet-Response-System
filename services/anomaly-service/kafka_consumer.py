"""Kafka consumer for raw_telemetry topic.

Thin wrapper for consuming RawTelemetryEvent messages from the raw_telemetry topic.
"""

import json
import logging
import time
from typing import Iterator, Optional

from services.schemas.events import RawTelemetryEvent
from services.kafka_utils import wait_for_kafka

from .config import AnomalyConfig

logger = logging.getLogger(__name__)

# TODO: Implement event_id-based deduplication here
# This will prevent processing duplicate events if the consumer receives them
# TODO: Implement per-vehicle ordering guarantees enforcement here
# This will ensure events from the same vehicle are processed in order


class KafkaConsumer:
    """Thin Kafka consumer wrapper for raw_telemetry topic."""

    def __init__(self, config: AnomalyConfig):
        """Initialize consumer with configuration.

        Args:
            config: Anomaly service configuration
        """
        self.config = config
        self._consumer: Optional[object] = None
        self._initialized = False
        self._retry_count = 0
        self._max_retries = 10
        self._base_retry_delay = 2  # seconds
        self._max_retry_delay = 15  # Cap at 15s instead of 60s

    def _ensure_initialized(self) -> bool:
        """Initialize Kafka consumer if not already initialized.

        Returns:
            True if initialized successfully, False otherwise
        """
        if self._initialized and self._consumer is not None:
            return True

        # Wait for Kafka to be ready on first attempt
        if self._retry_count == 0:
            logger.info(f"Waiting for Kafka at {self.config.kafka_consumer.bootstrap_servers} to be ready...")
            if not wait_for_kafka(
                self.config.kafka_consumer.bootstrap_servers,
                max_wait=30.0,  # Wait up to 30s for initial connection
                check_interval=2.0,
                use_consumer_check=True
            ):
                logger.warning("Kafka not ready after initial wait, will retry with backoff")

        # Retry logic with exponential backoff (capped at 15s)
        while self._retry_count < self._max_retries:
            try:
                # Lazy import to avoid dependency if Kafka is not available
                from kafka import KafkaConsumer as _KafkaConsumer

                logger.debug(
                    f"Attempting to create Kafka consumer (attempt {self._retry_count + 1}/{self._max_retries}) "
                    f"for topic 'raw_telemetry' at {self.config.kafka_consumer.bootstrap_servers}"
                )

                self._consumer = _KafkaConsumer(
                    "raw_telemetry",
                    bootstrap_servers=self.config.kafka_consumer.bootstrap_servers,
                    group_id=self.config.kafka_consumer.group_id,
                    key_deserializer=lambda k: k.decode("utf-8") if k else None,
                    value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                    auto_offset_reset="earliest",
                    enable_auto_commit=True,
                    request_timeout_ms=40000,  # FIXED: Must be > session_timeout_ms
                    session_timeout_ms=10000,
                    max_poll_interval_ms=300000,  # 5 minutes
                    api_version=(0, 10, 1),
                    consumer_timeout_ms=1000,  # Timeout for polling
                )
                
                # The consumer is created lazily, so creation itself doesn't verify connection
                # The actual connection will be attempted on first poll/iteration
                # If there's an issue, it will be caught when we try to consume
                
                self._initialized = True
                self._retry_count = 0  # Reset retry count on success
                logger.info(
                    f"Kafka consumer initialized successfully for topic 'raw_telemetry' "
                    f"with group_id '{self.config.kafka_consumer.group_id}'"
                )
                return True
            except Exception as e:
                self._retry_count += 1
                error_msg = str(e)
                error_type = type(e).__name__
                
                if self._retry_count < self._max_retries:
                    # Exponential backoff: 2s, 4s, 8s, 15s, 15s... (capped at 15s)
                    delay = min(self._base_retry_delay * (2 ** (self._retry_count - 1)), self._max_retry_delay)
                    logger.warning(
                        f"Failed to initialize Kafka consumer (attempt {self._retry_count}/{self._max_retries}): "
                        f"{error_type}: {error_msg}. Retrying in {delay} seconds..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"Failed to initialize Kafka consumer after {self._max_retries} attempts. "
                        f"Last error: {error_type}: {error_msg}"
                    )
                    self._consumer = None
                    self._initialized = True  # Mark as attempted to avoid infinite loops
                    return False

        return False

    def consume(self) -> Iterator[RawTelemetryEvent]:
        """Consume messages from Kafka.

        Yields:
            RawTelemetryEvent instances

        This will retry connection if Kafka becomes unavailable.
        """
        while True:
            if not self._ensure_initialized():
                logger.warning(
                    "Kafka consumer not available. Waiting before retrying initialization..."
                )
                time.sleep(10)  # Wait before retrying
                self._initialized = False  # Reset to allow retry
                self._retry_count = 0  # Reset retry count
                continue

            try:
                for message in self._consumer:
                    try:
                        event = RawTelemetryEvent(**message.value)
                        logger.debug(f"Consumed event {event.event_id} for vehicle {event.vehicle_id}")
                        yield event
                    except Exception as e:
                        logger.warning(f"Failed to parse message: {e}")
                        # Continue processing other messages
            except Exception as e:
                logger.error(f"Error consuming messages: {e}. Will retry connection...")
                # Close the consumer and reset state to allow reconnection
                if self._consumer:
                    try:
                        self._consumer.close()
                    except Exception:
                        pass
                self._consumer = None
                self._initialized = False
                self._retry_count = 0
                time.sleep(5)  # Brief wait before retrying

    def close(self) -> None:
        """Close the consumer.

        Safe no-op if consumer is not initialized.
        """
        if self._consumer:
            try:
                self._consumer.close()
            except Exception as e:
                logger.warning(f"Failed to close consumer: {e}")

