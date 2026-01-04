#!/bin/bash
# Trigger replay and verify system works

echo "🎬 Starting Demo..."

# Wait for services to be ready
echo "Checking if services are running..."

# Check replay service
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ Replay service not responding on port 8000"
    echo "   Make sure you ran: ./scripts/start_all.sh"
    exit 1
fi
echo "✅ Replay service is running"

# Check operator service
if ! curl -s http://localhost:8003/health > /dev/null 2>&1; then
    echo "❌ Operator service not responding on port 8003"
    echo "   Make sure you ran: ./scripts/start_all.sh"
    exit 1
fi
echo "✅ Operator service is running"

# Trigger replay for scene 0
echo ""
echo "Triggering replay for scene 0..."
RESPONSE=$(curl -s -X POST http://localhost:8000/replay/start \
    -H "Content-Type: application/json" \
    -d '{"scene_ids": [0]}')

if echo "$RESPONSE" | grep -q "started"; then
    echo "✅ Replay started!"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    echo "⚠️  Replay response: $RESPONSE"
    if echo "$RESPONSE" | grep -q "already running"; then
        echo "   Replay was already running - continuing..."
    else
        echo "❌ Failed to trigger replay"
        exit 1
    fi
fi

echo ""
echo "⏳ Waiting 20 seconds for data to flow through system..."
echo "   (Replay → Anomaly Detection → Operator Service)"
sleep 20

# Check for alerts
echo ""
echo "📊 Checking for alerts..."
ALERTS_RESPONSE=$(curl -s http://localhost:8003/alerts)
ALERT_COUNT=$(echo "$ALERTS_RESPONSE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

echo "Found $ALERT_COUNT alerts"

if [ "$ALERT_COUNT" -gt 0 ]; then
    echo ""
    echo "✅ SUCCESS! System is working end-to-end!"
    echo ""
    echo "Sample alerts:"
    echo "$ALERTS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -60
else
    echo ""
    echo "⚠️  No alerts found yet."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check anomaly-service logs for errors"
    echo "  2. Check operator-service logs for errors"
    echo "  3. Verify Kafka is running: docker ps | grep kafka"
    echo "  4. Wait longer and check again: curl http://localhost:8003/alerts"
fi

# Check vehicles
echo ""
echo "🚗 Checking for vehicles..."
VEHICLES_RESPONSE=$(curl -s http://localhost:8003/vehicles)
VEHICLE_COUNT=$(echo "$VEHICLES_RESPONSE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "Found $VEHICLE_COUNT vehicles"

# Get replay status
echo ""
echo "📈 Replay status:"
curl -s http://localhost:8000/replay/status | python3 -m json.tool 2>/dev/null

echo ""
echo "🌐 Open UI at: http://localhost:5173"
echo ""
echo "To stop replay:"
echo "  curl -X POST http://localhost:8000/replay/stop"

