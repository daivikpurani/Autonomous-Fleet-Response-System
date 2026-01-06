#!/bin/bash
# Demo startup script - starts all services for the FleetOps demo
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting FleetOps Demo..."

# Check Docker containers
echo "📦 Checking Docker services..."
if ! docker-compose ps | grep -q "healthy"; then
    echo "❌ Docker containers not healthy. Run: docker-compose up -d"
    exit 1
fi
echo "✅ Docker services running"

# Kill any existing Python services
echo "🧹 Cleaning up existing services..."
pkill -f "replay-service" 2>/dev/null || true
pkill -f "anomaly-service" 2>/dev/null || true
pkill -f "operator-service" 2>/dev/null || true
sleep 2

# Activate virtual environment
source venv/bin/activate
export PYTHONPATH="$PROJECT_ROOT"

# Clear old data for clean demo
echo "🗑️  Clearing old alerts..."
docker-compose exec -T postgres psql -U postgres -d fleetops -c "DELETE FROM alerts; DELETE FROM vehicle_state;" > /dev/null 2>&1 || true

# Start operator service (API + WebSocket)
echo "🔧 Starting Operator Service (port 8003)..."
python services/operator-service/run.py 8003 > /tmp/operator.log 2>&1 &
sleep 3

# Check operator service
if curl -s http://localhost:8003/health | grep -q "healthy"; then
    echo "✅ Operator Service running"
else
    echo "❌ Operator Service failed to start. Check /tmp/operator.log"
    exit 1
fi

# Start anomaly service (Kafka consumer + producer)
echo "🔍 Starting Anomaly Service..."
python services/anomaly-service/run.py > /tmp/anomaly.log 2>&1 &
sleep 3
echo "✅ Anomaly Service started (consuming from Kafka)"

# Start replay service
echo "📹 Starting Replay Service (port 8000)..."
python services/replay-service/run.py 8000 > /tmp/replay.log 2>&1 &
sleep 3

# Check replay service
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo "✅ Replay Service running"
else
    echo "❌ Replay Service failed to start. Check /tmp/replay.log"
    exit 1
fi

echo ""
echo "=================================================="
echo "🎯 All services started!"
echo ""
echo "📊 Dashboard:  http://localhost:5173"
echo "📡 API:        http://localhost:8003/alerts"
echo ""
echo "To start the demo replay:"
echo "  curl -X POST http://localhost:8000/demo/start"
echo ""
echo "To stop services:"
echo "  pkill -f 'replay-service|anomaly-service|operator-service'"
echo "=================================================="

