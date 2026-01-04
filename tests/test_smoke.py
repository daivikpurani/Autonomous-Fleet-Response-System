"""Smoke tests to verify system is working.

These tests require the system to be running:
  1. ./scripts/quick_start.sh
  2. ./scripts/start_all.sh

Run with: pytest tests/test_smoke.py -v
"""
import pytest
import time

# Skip all tests if httpx is not installed
pytest.importorskip("httpx")
import httpx


class TestServiceHealth:
    """Test that services are responding."""

    def test_replay_service_health(self):
        """Test replay service is responding."""
        try:
            response = httpx.get("http://localhost:8000/health", timeout=5)
            assert response.status_code == 200
            assert response.json()["status"] == "healthy"
        except httpx.ConnectError:
            pytest.skip("Replay service not running - start with ./scripts/start_all.sh")

    def test_operator_service_health(self):
        """Test operator service is responding."""
        try:
            response = httpx.get("http://localhost:8003/health", timeout=5)
            assert response.status_code == 200
            assert response.json()["status"] == "healthy"
        except httpx.ConnectError:
            pytest.skip("Operator service not running - start with ./scripts/start_all.sh")


class TestReplayAPI:
    """Test Replay Service API endpoints."""

    def test_replay_status(self):
        """Test replay status endpoint."""
        try:
            response = httpx.get("http://localhost:8000/replay/status", timeout=5)
            assert response.status_code == 200
            data = response.json()
            assert "active" in data
            assert "replay_rate" in data
        except httpx.ConnectError:
            pytest.skip("Replay service not running")

    def test_replay_start_stop(self):
        """Test starting and stopping replay."""
        try:
            # Start replay
            response = httpx.post(
                "http://localhost:8000/replay/start",
                json={"scene_ids": [0]},
                timeout=10
            )
            # Accept both 200 (started) and 400 (already running)
            assert response.status_code in [200, 400]
            
            # Check status
            response = httpx.get("http://localhost:8000/replay/status", timeout=5)
            assert response.status_code == 200
            
            # Stop replay
            response = httpx.post("http://localhost:8000/replay/stop", timeout=10)
            # Accept both 200 (stopped) and 400 (not running)
            assert response.status_code in [200, 400]
        except httpx.ConnectError:
            pytest.skip("Replay service not running")


class TestOperatorAPI:
    """Test Operator Service API endpoints."""

    def test_get_alerts(self):
        """Test getting alerts."""
        try:
            response = httpx.get("http://localhost:8003/alerts", timeout=5)
            assert response.status_code == 200
            assert isinstance(response.json(), list)
        except httpx.ConnectError:
            pytest.skip("Operator service not running")

    def test_get_vehicles(self):
        """Test getting vehicles."""
        try:
            response = httpx.get("http://localhost:8003/vehicles", timeout=5)
            assert response.status_code == 200
            assert isinstance(response.json(), list)
        except httpx.ConnectError:
            pytest.skip("Operator service not running")

    def test_get_actions(self):
        """Test getting actions."""
        try:
            response = httpx.get("http://localhost:8003/actions", timeout=5)
            assert response.status_code == 200
            assert isinstance(response.json(), list)
        except httpx.ConnectError:
            pytest.skip("Operator service not running")


@pytest.mark.slow
class TestEndToEnd:
    """End-to-end tests that verify message flow."""

    def test_end_to_end_flow(self):
        """Test complete message flow from replay to operator.
        
        This test:
        1. Starts replay for scene 0
        2. Waits for messages to flow
        3. Verifies alerts appear in operator service
        """
        try:
            # 1. Start replay
            response = httpx.post(
                "http://localhost:8000/replay/start",
                json={"scene_ids": [0]},
                timeout=10
            )
            # Accept started or already running
            assert response.status_code in [200, 400]
            
            # 2. Wait for messages to flow through system
            print("\nWaiting 25 seconds for messages to flow...")
            time.sleep(25)
            
            # 3. Check for alerts
            response = httpx.get("http://localhost:8003/alerts", timeout=5)
            assert response.status_code == 200
            alerts = response.json()
            
            # Log what we found
            print(f"Found {len(alerts)} alerts")
            
            # Should have at least 1 alert after processing
            assert len(alerts) > 0, (
                "No alerts created - check if anomaly-service and operator-service "
                "are processing messages correctly"
            )
            
            # 4. Stop replay
            httpx.post("http://localhost:8000/replay/stop", timeout=10)
            
        except httpx.ConnectError:
            pytest.skip("Services not running - start with ./scripts/start_all.sh")

