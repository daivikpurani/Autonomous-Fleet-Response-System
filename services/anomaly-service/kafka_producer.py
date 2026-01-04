"""Kafka producer for anomalies topic.

Thin wrapper for publishing AnomalyEvent messages to the anomalies topic.
"""

import json
import logging
import time
from typing import Optional

from services.schemas.events import AnomalyEvent
from services.kafka_utils import wait_for_kafka

from .config import AnomalyConfig

logger = logging.getLogger(__name__)

# TODO: Implement anomaly_id-based deduplication here
# This will prevent duplicate anomalies from being published if the producer retries


class KafkaProducer:
    """Thin Kafka producer wrapper for anomalies topic."""

    def __init__(self, config: AnomalyConfig):
        """Initialize producer with configuration.

        Args:
            config: Anomaly service configuration
        """
        self.config = config
        self._producer: Optional[object] = None
        self._initialized = False
        self._retry_count = 0
        self._max_retries = 10
        self._base_retry_delay = 2  # seconds
        self._max_retry_delay = 15  # Cap at 15s instead of 60s

    def _ensure_initialized(self) -> bool:
        """Initialize Kafka producer if not already initialized.

        Returns:
            True if initialized successfully, False otherwise
        """
        if self._initialized and self._producer is not None:
            return True

        # Wait for Kafka to be ready on first attempt
        if self._retry_count == 0:
            logger.info("Waiting for Kafka to be ready...")
            if not wait_for_kafka(
                self.config.kafka_producer.bootstrap_servers,
                max_wait=30.0,  # Wait up to 30s for initial connection
                check_interval=2.0
            ):
                logger.warning("Kafka not ready, will retry with backoff")

        # Retry logic with exponential backoff (capped at 15s)
        while self._retry_count < self._max_retries:
            try:
                # Lazy import to avoid dependency if Kafka is not available
                from kafka import KafkaProducer as _KafkaProducer

                self._producer = _KafkaProducer(
                    bootstrap_servers=self.config.kafka_producer.bootstrap_servers,
                    key_serializer=lambda k: k.encode("utf-8") if k else None,
                    value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                    request_timeout_ms=10000,  # FIXED: Increased from 5s to 10s
                    api_version=(0, 10, 1),
                )
                self._initialized = True
                self._retry_count = 0  # Reset retry count on success
                logger.info("Kafka producer initialized successfully")
                return True
            except Exception as e:
                self._retry_count += 1
                if self._retry_count < self._max_retries:
                    # Exponential backoff: 2s, 4s, 8s, 15s, 15s... (capped at 15s)
                    delay = min(self._base_retry_delay * (2 ** (self._retry_count - 1)), self._max_retry_delay)
                    logger.warning(
                        f"Failed to initialize Kafka producer (attempt {self._retry_count}/{self._max_retries}): {e}. "
                        f"Retrying in {delay} seconds..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"Failed to initialize Kafka producer after {self._max_retries} attempts: {e}"
                    )
                    self._producer = None
                    self._initialized = True  # Mark as attempted to avoid infinite loops
                    return False

        return False

    def produce(self, event: AnomalyEvent) -> None:
        """Publish an anomaly event to Kafka.

        Args:
            event: AnomalyEvent to publish

        Will retry initialization if Kafka becomes unavailable.
        """
        # Reset initialization state if producer failed previously
        if self._initialized and self._producer is None:
            self._initialized = False
            self._retry_count = 0

        if not self._ensure_initialized():
            logger.warning("Kafka producer not available, skipping event")
            return

        try:
            # Partition key: vehicle_id
            self._producer.send(
                topic="anomalies",
                key=event.vehicle_id,
                value=event.model_dump(),
            )
            logger.debug(f"Published anomaly {event.anomaly_id} for vehicle {event.vehicle_id}")
        except Exception as e:
            logger.warning(f"Failed to publish anomaly {event.anomaly_id}: {e}")
            # Reset producer state to allow reconnection on next call
            if self._producer:
                try:
                    self._producer.close()
                except Exception:
                    pass
            self._producer = None
            self._initialized = False
            self._retry_count = 0

    def flush(self) -> None:
        """Flush any pending messages.

        Safe no-op if producer is not initialized.
        """
        if self._producer:
            try:
                self._producer.flush()
            except Exception as e:
                logger.warning(f"Failed to flush producer: {e}")

    def close(self) -> None:
        """Close the producer.

        Safe no-op if producer is not initialized.
        """
        if self._producer:
            try:
                self._producer.close()
            except Exception as e:
                logger.warning(f"Failed to close producer: {e}")

