"""Unit tests for anomaly detection.

Run with: pytest tests/unit/test_anomalies.py -v
"""
import sys
from pathlib import Path

# Add project root and anomaly service to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "services" / "anomaly-service"))

import pytest
from datetime import datetime
from uuid import uuid4

# Import from services
from services.schemas.events import RawTelemetryEvent

# Import from anomaly service
from anomalies.rules import (
    SuddenDecelerationRule,
    PerceptionInstabilityRule,
    DropoutProxyRule,
)
from anomalies.detectors import AnomalyDetector


def create_mock_event(speed=10.0, velocity=None):
    """Create a mock telemetry event for testing."""
    if velocity is None:
        velocity = {"vx": speed, "vy": 0.0}
    return RawTelemetryEvent(
        event_id=uuid4(),
        event_time=datetime.utcnow(),
        processing_time=datetime.utcnow(),
        vehicle_id="test_vehicle",
        scene_id="0",
        frame_index=0,
        is_ego=False,
        track_id=1,
        centroid={"x": 0.0, "y": 0.0, "z": 0.0},
        velocity=velocity,
        speed=speed,
        yaw=0.0,
        label_probabilities=None,
    )


class TestSuddenDecelerationRule:
    """Tests for sudden deceleration anomaly rule."""

    def test_warning_threshold(self):
        """Test warning threshold detection."""
        rule = SuddenDecelerationRule()
        event = create_mock_event(speed=5.0)
        
        # Acceleration between warning (-3.0) and critical (-5.0)
        result = rule.evaluate(event, {"acceleration": -3.5}, [])
        
        assert result.triggered is True
        assert result.severity == "WARNING"
        assert result.rule_name == "sudden_deceleration"

    def test_critical_threshold(self):
        """Test critical threshold detection."""
        rule = SuddenDecelerationRule()
        event = create_mock_event(speed=2.0)
        
        # Acceleration beyond critical threshold (-5.0)
        result = rule.evaluate(event, {"acceleration": -6.0}, [])
        
        assert result.triggered is True
        assert result.severity == "CRITICAL"
        assert result.rule_name == "sudden_deceleration"

    def test_no_trigger(self):
        """Test no trigger for normal acceleration."""
        rule = SuddenDecelerationRule()
        event = create_mock_event()
        
        # Acceleration within normal range
        result = rule.evaluate(event, {"acceleration": -1.0}, [])
        
        assert result.triggered is False

    def test_missing_acceleration(self):
        """Test behavior when acceleration is missing."""
        rule = SuddenDecelerationRule()
        event = create_mock_event()
        
        # No acceleration in features
        result = rule.evaluate(event, {}, [])
        
        assert result.triggered is False

    def test_custom_thresholds(self):
        """Test with custom thresholds."""
        custom_thresholds = {
            "sudden_deceleration": {
                "warning": -2.0,
                "critical": -4.0,
            }
        }
        rule = SuddenDecelerationRule(thresholds=custom_thresholds)
        event = create_mock_event(speed=5.0)
        
        # Test warning with custom threshold
        result = rule.evaluate(event, {"acceleration": -2.5}, [])
        assert result.triggered is True
        assert result.severity == "WARNING"
        
        # Test critical with custom threshold
        result = rule.evaluate(event, {"acceleration": -4.5}, [])
        assert result.triggered is True
        assert result.severity == "CRITICAL"


class TestPerceptionInstabilityRule:
    """Tests for perception instability anomaly rule."""

    def test_centroid_jump_warning(self):
        """Test centroid jump warning detection."""
        rule = PerceptionInstabilityRule()
        event = create_mock_event()
        
        # Centroid displacement above warning threshold (5.0m)
        result = rule.evaluate(event, {"centroid_displacement": 6.0}, [])
        
        assert result.triggered is True
        assert "centroid" in result.explanation.lower()

    def test_centroid_jump_critical(self):
        """Test centroid jump critical detection."""
        rule = PerceptionInstabilityRule()
        event = create_mock_event()
        
        # Centroid displacement above critical threshold (10.0m)
        result = rule.evaluate(event, {"centroid_displacement": 12.0}, [])
        
        assert result.triggered is True
        assert result.severity == "CRITICAL"

    def test_no_trigger(self):
        """Test no trigger for normal perception."""
        rule = PerceptionInstabilityRule()
        event = create_mock_event()
        
        # Normal centroid displacement
        result = rule.evaluate(event, {"centroid_displacement": 1.0}, [])
        
        assert result.triggered is False


class TestDropoutProxyRule:
    """Tests for dropout proxy anomaly rule."""

    def test_agent_count_drop(self):
        """Test agent count drop detection."""
        rule = DropoutProxyRule()
        event = create_mock_event()
        
        # Significant drop in active agent count
        result = rule.evaluate(
            event, {}, [],
            active_agent_count=10,
            prev_active_agent_count=20  # 10 agent drop
        )
        
        assert result.triggered is True
        assert result.rule_name == "dropout_proxy"

    def test_no_significant_drop(self):
        """Test no trigger for minor changes."""
        rule = DropoutProxyRule()
        event = create_mock_event()
        
        # Minor change in agent count (below threshold)
        result = rule.evaluate(
            event, {}, [],
            active_agent_count=18,
            prev_active_agent_count=20  # Only 2 agent drop
        )
        
        assert result.triggered is False


class TestAnomalyDetector:
    """Tests for the anomaly detector orchestrator."""

    def test_detector_runs_all_rules(self):
        """Test that detector evaluates all rules."""
        detector = AnomalyDetector()
        event = create_mock_event(speed=2.0)
        
        # Create features that trigger sudden deceleration
        features = {"acceleration": -6.0}
        
        anomalies = detector.detect(
            event=event,
            features=features,
            frames=[],
            active_agent_count=10,
            prev_active_agent_count=10,
        )
        
        # Should detect at least the deceleration anomaly
        assert len(anomalies) > 0
        
        # Check that sudden_deceleration was detected
        rule_names = [a.rule_name for a in anomalies]
        assert "sudden_deceleration" in rule_names
