"""Unit tests for feature extraction.

Run with: pytest tests/unit/test_features.py -v
"""
import sys
from pathlib import Path

# Add project root and anomaly service to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "services" / "anomaly-service"))

import pytest
from datetime import datetime, timedelta

# Import from anomaly service
from features.extractors import FeatureExtractor
from features.windows import VehicleState, StateManager, RING_BUFFER_SIZE


class MockFrame:
    """Mock telemetry frame for testing."""
    
    def __init__(
        self,
        speed: float,
        time_offset: float,
        centroid_x: float = 0.0,
        centroid_y: float = 0.0,
        yaw: float = 0.0,
    ):
        self.speed = speed
        self.event_time = datetime.utcnow() + timedelta(seconds=time_offset)
        self.centroid = {"x": centroid_x, "y": centroid_y, "z": 0.0}
        self.yaw = yaw
        self.label_probabilities = None
        self.frame_index = int(time_offset * 10)


class TestFeatureExtractor:
    """Tests for the feature extractor."""

    def test_extract_acceleration_deceleration(self):
        """Test acceleration extraction for deceleration."""
        extractor = FeatureExtractor()
        
        # Create frames showing deceleration
        frames = [
            MockFrame(speed=10.0, time_offset=0.0),
            MockFrame(speed=5.0, time_offset=0.1),  # Lost 5 m/s in 0.1s
        ]
        
        acceleration = extractor.extract_acceleration(frames)
        
        assert acceleration is not None
        assert acceleration < 0  # Should be negative (deceleration)
        # Expected: (5 - 10) / 0.1 = -50 m/s²
        assert abs(acceleration - (-50.0)) < 1.0

    def test_extract_acceleration_positive(self):
        """Test acceleration extraction for positive acceleration."""
        extractor = FeatureExtractor()
        
        # Create frames showing acceleration
        frames = [
            MockFrame(speed=5.0, time_offset=0.0),
            MockFrame(speed=10.0, time_offset=0.1),  # Gained 5 m/s in 0.1s
        ]
        
        acceleration = extractor.extract_acceleration(frames)
        
        assert acceleration is not None
        assert acceleration > 0  # Should be positive (acceleration)

    def test_extract_acceleration_insufficient_frames(self):
        """Test acceleration with insufficient frames."""
        extractor = FeatureExtractor()
        
        # Only one frame - can't compute acceleration
        frames = [MockFrame(speed=10.0, time_offset=0.0)]
        
        acceleration = extractor.extract_acceleration(frames)
        
        assert acceleration is None

    def test_extract_centroid_displacement(self):
        """Test centroid displacement extraction."""
        extractor = FeatureExtractor()
        
        # Create frames with movement
        frames = [
            MockFrame(speed=10.0, time_offset=0.0, centroid_x=0.0, centroid_y=0.0),
            MockFrame(speed=10.0, time_offset=0.1, centroid_x=3.0, centroid_y=4.0),
        ]
        
        displacement = extractor.extract_centroid_displacement(frames)
        
        assert displacement is not None
        # Expected: sqrt(3² + 4²) = 5.0
        assert abs(displacement - 5.0) < 0.01

    def test_extract_centroid_displacement_insufficient(self):
        """Test centroid displacement with insufficient frames."""
        extractor = FeatureExtractor()
        
        frames = [MockFrame(speed=10.0, time_offset=0.0)]
        
        displacement = extractor.extract_centroid_displacement(frames)
        
        assert displacement is None

    def test_extract_heading_change(self):
        """Test heading change extraction."""
        import math
        
        extractor = FeatureExtractor()
        
        # Create frames with yaw change
        frames = [
            MockFrame(speed=10.0, time_offset=0.0, yaw=0.0),
            MockFrame(speed=10.0, time_offset=0.1, yaw=math.pi / 4),  # 45 degrees
        ]
        
        heading_change = extractor.extract_heading_change(frames)
        
        assert heading_change is not None
        assert abs(heading_change - math.pi / 4) < 0.01

    def test_extract_all_features(self):
        """Test extracting all features at once."""
        extractor = FeatureExtractor()
        
        frames = [
            MockFrame(speed=10.0, time_offset=0.0, centroid_x=0.0, centroid_y=0.0),
            MockFrame(speed=5.0, time_offset=0.1, centroid_x=1.0, centroid_y=0.0),
        ]
        
        features = extractor.extract_all_features(frames, frame_index=1)
        
        assert "acceleration" in features
        assert "centroid_displacement" in features
        assert "heading_change" in features
        assert features["acceleration"] is not None
        assert features["centroid_displacement"] is not None


class TestVehicleState:
    """Tests for vehicle state ring buffer."""

    def test_ring_buffer_capacity(self):
        """Test that ring buffer maintains capacity."""
        from services.schemas.events import RawTelemetryEvent
        from uuid import uuid4
        
        state = VehicleState("test_vehicle")
        
        # Add more frames than buffer size
        for i in range(RING_BUFFER_SIZE + 5):
            event = RawTelemetryEvent(
                event_id=uuid4(),
                event_time=datetime.utcnow() + timedelta(seconds=i * 0.1),
                processing_time=datetime.utcnow(),
                vehicle_id="test_vehicle",
                scene_id="0",
                frame_index=i,
                is_ego=False,
                track_id=1,
                centroid={"x": 0.0, "y": 0.0, "z": 0.0},
                velocity={"vx": 10.0, "vy": 0.0},
                speed=10.0,
                yaw=0.0,
                label_probabilities=None,
            )
            state.add_frame(event)
        
        # Should only have RING_BUFFER_SIZE frames
        frames = state.get_frames()
        assert len(frames) == RING_BUFFER_SIZE

    def test_sufficient_history(self):
        """Test sufficient history check."""
        from services.schemas.events import RawTelemetryEvent
        from uuid import uuid4
        
        state = VehicleState("test_vehicle")
        
        # Initially not enough history
        assert state.has_sufficient_history(min_frames=2) is False
        
        # Add one frame
        event1 = RawTelemetryEvent(
            event_id=uuid4(),
            event_time=datetime.utcnow(),
            processing_time=datetime.utcnow(),
            vehicle_id="test_vehicle",
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
        state.add_frame(event1)
        
        # Still not enough
        assert state.has_sufficient_history(min_frames=2) is False
        
        # Add second frame
        event2 = RawTelemetryEvent(
            event_id=uuid4(),
            event_time=datetime.utcnow() + timedelta(seconds=0.1),
            processing_time=datetime.utcnow(),
            vehicle_id="test_vehicle",
            scene_id="0",
            frame_index=1,
            is_ego=False,
            track_id=1,
            centroid={"x": 0.0, "y": 0.0, "z": 0.0},
            velocity={"vx": 10.0, "vy": 0.0},
            speed=10.0,
            yaw=0.0,
            label_probabilities=None,
        )
        state.add_frame(event2)
        
        # Now should have enough
        assert state.has_sufficient_history(min_frames=2) is True


class TestStateManager:
    """Tests for the state manager."""

    def test_create_vehicle(self):
        """Test vehicle creation."""
        manager = StateManager()
        
        state = manager.get_or_create_vehicle("test_vehicle")
        
        assert state is not None
        assert state.vehicle_id == "test_vehicle"

    def test_get_existing_vehicle(self):
        """Test getting existing vehicle."""
        manager = StateManager()
        
        # Create vehicle
        state1 = manager.get_or_create_vehicle("test_vehicle")
        
        # Get same vehicle again
        state2 = manager.get_or_create_vehicle("test_vehicle")
        
        # Should be the same object
        assert state1 is state2
