"""Kafka producer wrapper for replay service.

Thin wrapper for publishing RawTelemetryEvent messages to the raw_telemetry topic.
"""

import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

# Ensure workspace root is in path for schemas import
# This makes the import work regardless of where the service is run from
# Path: services/replay-service/kafka_producer.py -> up 2 levels -> workspace root
_workspace_root = Path(__file__).resolve().parent.parent.parent
if str(_workspace_root) not in sys.path:
    sys.path.insert(0, str(_workspace_root))

from services.schemas.events import RawTelemetryEvent
from services.kafka_utils import wait_for_kafka

from .config import ReplayConfig

logger = logging.getLogger(__name__)

# TODO: Implement event_id-based deduplication here
# This will prevent duplicate events from being published if the producer retries


class KafkaProducer:
    """Thin Kafka producer wrapper for raw_telemetry topic."""

    def __init__(self, config: ReplayConfig):
        """Initialize producer with configuration.

        Args:
            config: Replay service configuration
        """
        self.config = config
        self._producer: Optional[object] = None
        self._initialized = False
        self._retry_count = 0
        self._max_retries = 10
        self._base_retry_delay = 2
        self._max_retry_delay = 15

    def _ensure_initialized(self) -> bool:
        """Initialize Kafka producer if not already initialized.

        Returns:
            True if initialized successfully, False otherwise
        """
        if self._initialized and self._producer is not None:
            return True

        # Wait for Kafka on first attempt
        if self._retry_count == 0:
            logger.info("Waiting for Kafka to be ready...")
            if not wait_for_kafka(
                self.config.kafka.bootstrap_servers,
                max_wait=30.0,
                check_interval=2.0
            ):
                logger.warning("Kafka not ready, will retry with backoff")

        # Retry logic with exponential backoff
        while self._retry_count < self._max_retries:
            try:
                # Lazy import to avoid dependency if Kafka is not available
                from kafka import KafkaProducer as _KafkaProducer

                self._producer = _KafkaProducer(
                    bootstrap_servers=self.config.kafka.bootstrap_servers,
                    key_serializer=lambda k: k.encode("utf-8") if k else None,
                    value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                    request_timeout_ms=10000,  # FIXED: Increased from 5s to 10s
                    api_version=(0, 10, 1),
                )
                self._initialized = True
                self._retry_count = 0
                logger.info("Kafka producer initialized")
                return True
            except Exception as e:
                self._retry_count += 1
                if self._retry_count < self._max_retries:
                    delay = min(self._base_retry_delay * (2 ** (self._retry_count - 1)), self._max_retry_delay)
                    logger.warning(
                        f"Failed to initialize Kafka producer (attempt {self._retry_count}/{self._max_retries}): {e}. "
                        f"Retrying in {delay} seconds..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(f"Failed to initialize Kafka producer after {self._max_retries} attempts: {e}")
                    self._producer = None
                    self._initialized = True
                    return False

        return False

    def produce(self, event: RawTelemetryEvent) -> None:
        """Publish a raw telemetry event to Kafka.

        Args:
            event: RawTelemetryEvent to publish

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
                topic="raw_telemetry",
                key=event.vehicle_id,
                value=event.model_dump(),
            )
            logger.debug(f"Published event {event.event_id} for vehicle {event.vehicle_id}")
        except Exception as e:
            logger.warning(f"Failed to publish event {event.event_id}: {e}")
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

