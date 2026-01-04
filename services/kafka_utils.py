"""Shared Kafka utilities for connection and readiness checks."""

import logging
import socket
import time
from typing import Optional

logger = logging.getLogger(__name__)


def check_kafka_connection(bootstrap_servers: str, timeout: float = 2.0) -> bool:
    """Check if Kafka broker is accepting connections.
    
    Args:
        bootstrap_servers: Kafka bootstrap servers (e.g., "localhost:9092")
        timeout: Connection timeout in seconds
        
    Returns:
        True if connection successful, False otherwise
    """
    try:
        # Parse host:port
        if ":" in bootstrap_servers:
            host, port = bootstrap_servers.rsplit(":", 1)
            port = int(port)
        else:
            host = bootstrap_servers
            port = 9092
            
        # Try TCP connection
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception as e:
        logger.debug(f"Kafka connection check failed: {e}")
        return False


def check_kafka_ready(bootstrap_servers: str, timeout: float = 5.0) -> bool:
    """Check if Kafka is ready by attempting to list topics.
    
    This is more reliable than just TCP connectivity as it verifies Kafka
    can actually handle API requests.
    
    Args:
        bootstrap_servers: Kafka bootstrap servers
        timeout: Connection timeout in seconds
        
    Returns:
        True if Kafka is ready, False otherwise
    """
    try:
        try:
            from kafka import KafkaAdminClient
        except ImportError:
            # KafkaAdminClient might not be available in older versions
            # Fall back to TCP check only
            logger.debug("KafkaAdminClient not available, using TCP check only")
            return check_kafka_connection(bootstrap_servers, timeout)
        
        # Try to create an admin client and list topics
        admin_client = None
        try:
            admin_client = KafkaAdminClient(
                bootstrap_servers=bootstrap_servers,
                request_timeout_ms=int(timeout * 1000),
                api_version=(0, 10, 1),
            )
            
            # Try to list topics - this will fail if Kafka isn't ready
            admin_client.list_topics(timeout_ms=int(timeout * 1000))
            if admin_client:
                admin_client.close()
            return True
        except Exception as e:
            if admin_client:
                try:
                    admin_client.close()
                except Exception:
                    pass
            logger.debug(f"Kafka topic listing failed: {e}")
            return False
    except Exception as e:
        logger.debug(f"Kafka readiness check failed: {e}")
        return False


def wait_for_kafka(
    bootstrap_servers: str,
    max_wait: float = 60.0,
    check_interval: float = 2.0,
    timeout: float = 2.0,
    use_consumer_check: bool = True
) -> bool:
    """Wait for Kafka to be ready.
    
    Args:
        bootstrap_servers: Kafka bootstrap servers
        max_wait: Maximum time to wait in seconds
        check_interval: Time between checks in seconds
        timeout: Connection timeout per check
        use_consumer_check: If True, uses actual consumer connection check (more reliable)
        
    Returns:
        True if Kafka is ready, False if timeout
    """
    start_time = time.time()
    attempt = 0
    
    while time.time() - start_time < max_wait:
        attempt += 1
        
        # First check TCP connectivity (fast)
        if check_kafka_connection(bootstrap_servers, timeout):
            # If TCP works, do a more thorough check with actual consumer
            if use_consumer_check:
                if check_kafka_ready(bootstrap_servers, timeout=3.0):
                    elapsed = time.time() - start_time
                    logger.info(f"Kafka is ready after {elapsed:.1f}s")
                    return True
            else:
                elapsed = time.time() - start_time
                logger.info(f"Kafka is ready after {elapsed:.1f}s")
                return True
        
        elapsed = time.time() - start_time
        if attempt % 5 == 0:  # Log every 5 attempts
            logger.info(f"Waiting for Kafka... ({elapsed:.1f}s/{max_wait}s)")
        time.sleep(check_interval)
    
    elapsed = time.time() - start_time
    logger.warning(f"Kafka not ready after {elapsed:.1f}s")
    return False

