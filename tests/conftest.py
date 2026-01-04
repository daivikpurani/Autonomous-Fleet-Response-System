"""Basic test fixtures for Fleet Response System."""
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import pytest
from datetime import datetime
from uuid import uuid4


@pytest.fixture
def mock_telemetry_event():
    """Mock telemetry event for testing."""
    from services.schemas.events import RawTelemetryEvent
    
    return RawTelemetryEvent(
        event_id=uuid4(),
        event_time=datetime.utcnow(),
        processing_time=datetime.utcnow(),
        vehicle_id="test_vehicle_1",
        scene_id="0",
        frame_index=0,
        is_ego=False,
        track_id=1,
        centroid={"x": 0.0, "y": 0.0, "z": 0.0},
        velocity={"vx": 10.0, "vy": 0.0},
        speed=10.0,
        yaw=0.0,
        label_probabilities=None,
    )


@pytest.fixture
def mock_anomaly_event():
    """Mock anomaly event for testing."""
    from services.schemas.events import AnomalyEvent
    
    return AnomalyEvent(
        anomaly_id=uuid4(),
        event_time=datetime.utcnow(),
        processing_time=datetime.utcnow(),
        vehicle_id="test_vehicle_1",
        scene_id="0",
        frame_index=0,
        rule_name="sudden_deceleration",
        features={"acceleration": -5.0},
        thresholds={"warning": -3.0, "critical": -5.0},
        severity="CRITICAL",
    )

