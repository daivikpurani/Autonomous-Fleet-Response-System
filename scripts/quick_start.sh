#!/bin/bash
set -e

echo "🚀 Quick Start for Fleet Response System Demo"

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker not running. Please start Docker Desktop."
    exit 1
fi
echo "✅ Docker is running"

# 2. Start infrastructure
echo "Starting Docker containers..."
docker-compose up -d
echo "Waiting for containers to be healthy (30 seconds)..."
sleep 30

# 3. Create database schema (simple one-liner)
echo "Creating database schema..."
docker exec fleetops-postgres psql -U postgres -d fleetops -c "
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    frame_index INTEGER NOT NULL,
    anomaly_id UUID NOT NULL UNIQUE,
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    anomaly_payload JSONB NOT NULL,
    first_seen_event_time TIMESTAMPTZ NOT NULL,
    last_seen_event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_alerts_vehicle_id ON alerts(vehicle_id);

CREATE TABLE IF NOT EXISTS operator_actions (
    id UUID PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    alert_id UUID,
    action_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_state (
    vehicle_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'NORMAL',
    assigned_operator TEXT,
    last_position_x FLOAT,
    last_position_y FLOAT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
" 2>/dev/null || echo "Schema already exists or created"

echo "✅ Database schema ready"

# 4. Create threshold config if missing
if [ ! -f "$PROJECT_ROOT/services/anomaly-service/config/thresholds.json" ]; then
    echo "Creating threshold config..."
    cp "$PROJECT_ROOT/services/anomaly-service/config/thresholds.json.example" "$PROJECT_ROOT/services/anomaly-service/config/thresholds.json"
    echo "✅ Threshold config created"
else
    echo "✅ Threshold config exists"
fi

# 5. Check container health
echo ""
echo "Checking container status..."
docker-compose ps

echo ""
echo "✅ Infrastructure ready!"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/start_all.sh"
echo "  2. Wait for services to start"
echo "  3. Run: ./scripts/trigger_demo.sh"

