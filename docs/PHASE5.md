# Phase 5: Operator Service & Alert Management

## Overview

Phase 5 implements the operator service that consumes anomaly events, manages alert lifecycle, provides REST API endpoints, and broadcasts real-time updates via WebSocket. This phase does **not** include:
- UI components
- Frontend implementation
- Any future phase implementations

## Assumptions

### Alert Lifecycle

**Chosen**: Three-state lifecycle (OPEN → ACKNOWLEDGED → RESOLVED)

**Rationale**:
- **Simple workflow**: Clear progression through states
- **Operator tracking**: ACKNOWLEDGED state indicates operator attention
- **Audit trail**: Full history via action records
- **Standard pattern**: Common in incident management systems

### Alert Aggregation Strategy

**Chosen**: One alert per anomaly_id (no aggregation)

**Rationale**:
- **Simplicity**: Each anomaly event creates/updates one alert
- **Traceability**: Direct mapping from anomaly to alert
- **Idempotency**: Prevents duplicate alerts via anomaly_id uniqueness
- **Evidence preservation**: Full anomaly payload stored in alert

### Database Choice

**Chosen**: PostgreSQL with SQLAlchemy ORM

**Rationale**:
- **ACID compliance**: Ensures alert state consistency
- **Rich queries**: Support for filtering, sorting, aggregation
- **WebSocket integration**: Can broadcast on insert/update
- **Audit trail**: Full history of alerts and actions
- **Production-ready**: Suitable for real-world deployment

## Database Schema

### Alert Model

**Table**: `alerts`

**Fields**:
- `id`: UUID (primary key)
- `vehicle_id`: Text (indexed)
- `scene_id`: Text
- `frame_index`: Integer
- `anomaly_id`: UUID (unique, indexed)
- `rule_name`: Text (e.g., "sudden_deceleration")
- `severity`: Enum (INFO, WARNING, CRITICAL)
- `status`: Enum (OPEN, ACKNOWLEDGED, RESOLVED)
- `anomaly_payload`: JSONB (full anomaly event)
- `first_seen_event_time`: DateTime
- `last_seen_event_time`: DateTime
- `created_at`: DateTime (auto)
- `updated_at`: DateTime (auto)

**Indexes**:
- `ix_alerts_vehicle_id_status`: Composite index on (vehicle_id, status)
- `uq_alerts_anomaly_id`: Unique constraint on anomaly_id

**Relationships**:
- `actions`: One-to-many with OperatorAction

### OperatorAction Model

**Table**: `operator_actions`

**Fields**:
- `id`: UUID (primary key)
- `vehicle_id`: Text (indexed)
- `alert_id`: UUID (foreign key to alerts)
- `action_type`: Enum (ACKNOWLEDGE_ALERT, RESOLVE_ALERT, etc.)
- `actor`: Text (operator identifier)
- `payload`: JSONB (action metadata)
- `created_at`: DateTime (auto)

**Indexes**:
- `ix_operator_actions_vehicle_id_created_at`: Composite index

**Relationships**:
- `alert`: Many-to-one with Alert

### VehicleState Model

**Table**: `vehicle_state`

**Fields**:
- `vehicle_id`: Text (primary key)
- `state`: Enum (NORMAL, ALERTING, UNDER_INTERVENTION)
- `assigned_operator`: Text (nullable)
- `last_position_x`: Float (meters)
- `last_position_y`: Float (meters)
- `updated_at`: DateTime (auto)

**Purpose**: Track vehicle state and last known position

## Alert Lifecycle Management

### Alert Creation

**Trigger**: Anomaly event received from Kafka

**Process**:
1. Check if alert exists by `anomaly_id`
2. If exists: Update `last_seen_event_time` and `anomaly_payload`
3. If new: Create alert with `status=OPEN`
4. Update vehicle state (NORMAL → ALERTING if first OPEN alert)
5. Broadcast `alert_created` via WebSocket

**Idempotency**: Uses `anomaly_id` uniqueness constraint

### Alert Acknowledgment

**Trigger**: Operator action via REST API

**Process**:
1. Validate alert exists and is OPEN
2. Update alert `status=ACKNOWLEDGED`
3. Create OperatorAction record
4. Update vehicle state if needed
5. Broadcast `alert_updated` via WebSocket
6. Emit `OperatorActionEvent` to Kafka

**API Endpoint**: `POST /alerts/{alert_id}/ack`

### Alert Resolution

**Trigger**: Operator action via REST API

**Process**:
1. Validate alert exists and is ACKNOWLEDGED
2. Update alert `status=RESOLVED`
3. Create OperatorAction record
4. Update vehicle state (ALERTING → NORMAL if no other OPEN alerts)
5. Broadcast `alert_updated` via WebSocket
6. Emit `OperatorActionEvent` to Kafka

**API Endpoint**: `POST /alerts/{alert_id}/resolve`

## REST API Endpoints

### Alert Endpoints

#### GET /alerts

**Purpose**: List alerts with optional filters

**Query Parameters**:
- `status`: Filter by alert status (OPEN, ACKNOWLEDGED, RESOLVED)
- `vehicle_id`: Filter by vehicle ID
- `severity`: Filter by severity (INFO, WARNING, CRITICAL)

**Response**: List of `AlertResponse` objects

**Example**:
```bash
curl "http://localhost:8003/alerts?status=OPEN&severity=CRITICAL"
```

#### GET /alerts/{alert_id}

**Purpose**: Get single alert details

**Response**: `AlertResponse` object

**Example**:
```bash
curl "http://localhost:8003/alerts/{alert_id}"
```

#### POST /alerts/{alert_id}/ack

**Purpose**: Acknowledge an alert

**Request Body**:
```json
{
  "actor": "operator_001"
}
```

**Response**: `AlertResponse` object

**Example**:
```bash
curl -X POST "http://localhost:8003/alerts/{alert_id}/ack" \
  -H "Content-Type: application/json" \
  -d '{"actor": "operator_001"}'
```

#### POST /alerts/{alert_id}/resolve

**Purpose**: Resolve an alert

**Request Body**:
```json
{
  "actor": "operator_001",
  "action_type": "RESOLVE_ALERT"
}
```

**Response**: `AlertResponse` object

**Example**:
```bash
curl -X POST "http://localhost:8003/alerts/{alert_id}/resolve" \
  -H "Content-Type: application/json" \
  -d '{"actor": "operator_001", "action_type": "RESOLVE_ALERT"}'
```

### Vehicle Endpoints

#### GET /vehicles

**Purpose**: List all vehicles

**Response**: List of `VehicleResponse` objects

**Example**:
```bash
curl "http://localhost:8003/vehicles"
```

#### GET /vehicles/{vehicle_id}

**Purpose**: Get vehicle details

**Response**: `VehicleResponse` object with:
- Vehicle ID
- Current state
- Last position
- Assigned operator
- Alert count by status

**Example**:
```bash
curl "http://localhost:8003/vehicles/scene_0_track_42"
```

### Action Endpoints

#### GET /actions

**Purpose**: List operator actions

**Query Parameters**:
- `vehicle_id`: Filter by vehicle ID

**Response**: List of `ActionResponse` objects

**Example**:
```bash
curl "http://localhost:8003/actions?vehicle_id=scene_0_track_42"
```

## WebSocket API

### Connection

**Endpoint**: `ws://localhost:8003/ws`

**Protocol**: WebSocket (FastAPI WebSocket)

**Purpose**: Real-time event broadcasting

### Event Types

#### alert_created

**Trigger**: New alert created from anomaly event

**Payload**:
```json
{
  "event_type": "alert_created",
  "alert": {
    "id": "uuid",
    "vehicle_id": "scene_0_track_42",
    "rule_name": "sudden_deceleration",
    "severity": "WARNING",
    "status": "OPEN",
    ...
  }
}
```

#### alert_updated

**Trigger**: Alert status changed (acknowledged, resolved)

**Payload**:
```json
{
  "event_type": "alert_updated",
  "alert": {
    "id": "uuid",
    "status": "ACKNOWLEDGED",
    ...
  }
}
```

#### vehicle_updated

**Trigger**: Vehicle position or state changed

**Payload**:
```json
{
  "event_type": "vehicle_updated",
  "vehicle": {
    "vehicle_id": "scene_0_track_42",
    "state": "ALERTING",
    "last_position": {"x": 123.45, "y": 67.89},
    ...
  }
}
```

#### operator_action_created

**Trigger**: New operator action recorded

**Payload**:
```json
{
  "event_type": "operator_action_created",
  "action": {
    "id": "uuid",
    "action_type": "ACKNOWLEDGE_ALERT",
    "vehicle_id": "scene_0_track_42",
    ...
  }
}
```

### WebSocket Manager

**Class**: `WebSocketManager`

**Responsibilities**:
- Manage WebSocket connections
- Broadcast events to all connected clients
- Handle connection/disconnection
- Maintain connection pool

**Key Methods**:
- `connect(websocket)`: Add connection
- `disconnect(websocket)`: Remove connection
- `broadcast(event)`: Send event to all clients

## Kafka Consumers

### Anomaly Consumer

**Topic**: `anomalies`
**Consumer Group**: `operator-service-group`
**Purpose**: Process anomaly events and create alerts

**Process**:
1. Consume `AnomalyEvent` from Kafka
2. Call `AlertService.process_anomaly_event()`
3. Create or update alert in database
4. Broadcast `alert_created` or `alert_updated` via WebSocket

### Telemetry Consumer

**Topic**: `raw_telemetry`
**Consumer Group**: `operator-service-telemetry-group`
**Purpose**: Update vehicle positions

**Process**:
1. Consume `RawTelemetryEvent` from Kafka
2. Call `VehicleStateService.update_position()`
3. Update vehicle state with latest position
4. Broadcast `vehicle_updated` via WebSocket

## Kafka Producer

### Operator Actions Producer

**Topic**: `operator_actions`
**Purpose**: Emit operator action events for audit/logging

**Message Format**: `OperatorActionEvent`

**Key Fields**:
- `action_id`: UUID
- `alert_id`: UUID (if applicable)
- `vehicle_id`: Text
- `operator_id`: Text
- `action_type`: Enum
- `processing_time`: DateTime
- `metadata`: JSON

## Implementation Components

### Alert Service (`services/alert_service.py`)

**Responsibilities**:
- Process anomaly events
- Create/update alerts
- Manage alert lifecycle
- Update vehicle state

**Key Methods**:
- `process_anomaly_event(event, db)`: Process anomaly and create/update alert
- Returns `Alert` object

### Vehicle State Service (`services/vehicle_state_service.py`)

**Responsibilities**:
- Track vehicle state
- Update vehicle positions
- Manage state transitions

**Key Methods**:
- `update_state(vehicle_id, db)`: Update vehicle state based on alerts
- `update_position(vehicle_id, position, db)`: Update vehicle position

### Action Service (`services/action_service.py`)

**Responsibilities**:
- Handle operator actions
- Create action records
- Emit action events to Kafka

**Key Methods**:
- `acknowledge_alert(alert_id, actor, db)`: Acknowledge alert
- `resolve_alert(alert_id, actor, db)`: Resolve alert

### WebSocket Handler (`websocket/handler.py`)

**Responsibilities**:
- Manage WebSocket connections
- Broadcast events to clients
- Handle connection lifecycle

**Key Classes**:
- `WebSocketManager`: Connection manager

**Key Methods**:
- `connect(websocket)`: Add connection
- `disconnect(websocket)`: Remove connection
- `broadcast(event_type, data)`: Broadcast event

### API Routers (`api/`)

**Responsibilities**:
- Define REST endpoints
- Handle HTTP requests/responses
- Validate input
- Return Pydantic models

**Modules**:
- `alerts.py`: Alert endpoints
- `vehicles.py`: Vehicle endpoints
- `actions.py`: Action endpoints

### Database Models (`db/models.py`)

**Responsibilities**:
- Define SQLAlchemy models
- Define relationships
- Define indexes

**Models**:
- `Alert`: Alert model
- `OperatorAction`: Action model
- `VehicleState`: Vehicle state model

### Database Session (`db/session.py`)

**Responsibilities**:
- Create database sessions
- Initialize database connection
- Provide session factory

**Key Functions**:
- `get_db()`: Dependency for FastAPI endpoints

## Database Migrations

### Alembic Setup

**Tool**: Alembic (SQLAlchemy migrations)

**Configuration**: `alembic.ini`

**Migration Directory**: `alembic/versions/`

### Initial Migration

**Purpose**: Create initial schema

**Tables Created**:
- `alerts`
- `operator_actions`
- `vehicle_state`

**Run Migration**:
```bash
cd services/operator-service
alembic upgrade head
```

## What "Good" Output Looks Like

### Database Schema

```bash
# Connect to database
make psql

# List tables
\dt

# Describe alerts table
\d alerts
```

**Expected**: All tables exist with correct columns and indexes.

### REST API

```bash
# Health check
curl http://localhost:8003/health

# List alerts
curl http://localhost:8003/alerts

# Get vehicle
curl http://localhost:8003/vehicles/scene_0_track_42
```

**Expected**: JSON responses with correct schema.

### WebSocket Connection

```bash
# Test WebSocket (using wscat or similar)
wscat -c ws://localhost:8003/ws
```

**Expected**: Connection established, receives events when alerts are created.

### Kafka Consumer

**Expected Logs**:
```
2026-01-03 10:00:01 - operator - INFO - Created new alert {alert_id} for vehicle scene_0_track_42
2026-01-03 10:00:01 - websocket - INFO - Broadcasting alert_created to 1 clients
```

## Common Failure Modes and Fixes

### Database Connection Issues

**Problem**: Cannot connect to PostgreSQL
- **Fix**: Verify Postgres is running: `make health`
- **Fix**: Check DATABASE_URL environment variable
- **Fix**: Verify credentials match docker-compose.yml
- **Fix**: Check database exists: `psql -l`

**Problem**: Migration fails
- **Fix**: Check Alembic configuration
- **Fix**: Verify database connection
- **Fix**: Check for existing tables (may need to drop)
- **Fix**: Review migration scripts

### Alert Creation Issues

**Problem**: Alerts not created from anomalies
- **Fix**: Check Kafka consumer is running
- **Fix**: Verify consumer group is correct
- **Fix**: Check database session is initialized
- **Fix**: Review alert service logs

**Problem**: Duplicate alerts created
- **Fix**: Verify anomaly_id uniqueness constraint
- **Fix**: Check idempotency logic in AlertService
- **Fix**: Review anomaly event structure

### REST API Issues

**Problem**: Endpoints return 500 errors
- **Fix**: Check database connection
- **Fix**: Verify models are correct
- **Fix**: Check Pydantic model validation
- **Fix**: Review error logs

**Problem**: CORS errors from frontend
- **Fix**: Verify CORS middleware is configured
- **Fix**: Check allowed origins
- **Fix**: Verify frontend URL is in allowed list

### WebSocket Issues

**Problem**: WebSocket connection fails
- **Fix**: Check operator service is running
- **Fix**: Verify WebSocket endpoint is correct
- **Fix**: Check firewall/proxy settings
- **Fix**: Review WebSocket handler logs

**Problem**: No events received via WebSocket
- **Fix**: Verify WebSocket manager is broadcasting
- **Fix**: Check events are being triggered
- **Fix**: Verify connection is active
- **Fix**: Review broadcast logic

### Kafka Consumer Issues

**Problem**: Anomalies not consumed
- **Fix**: Check consumer group is correct
- **Fix**: Verify topic exists
- **Fix**: Check consumer configuration
- **Fix**: Review consumer logs

**Problem**: Consumer lagging
- **Fix**: Check processing speed
- **Fix**: Verify database performance
- **Fix**: Consider increasing consumer instances
- **Fix**: Review batch size settings

## Verification Checklist

After Phase 5 is complete:

- [ ] Database schema created (alerts, operator_actions, vehicle_state)
- [ ] Alembic migrations working
- [ ] Alert service processes anomaly events
- [ ] Alerts created/updated correctly
- [ ] Alert lifecycle transitions work (OPEN → ACK → RESOLVED)
- [ ] REST API endpoints respond correctly
- [ ] WebSocket connection established
- [ ] WebSocket events broadcast correctly
- [ ] Vehicle state tracking works
- [ ] Operator actions recorded
- [ ] Kafka consumers process events
- [ ] Kafka producer emits action events
- [ ] CORS configured for frontend

## Next Steps

After Phase 5 is complete:
1. Operator service is running
2. Alerts are managed in database
3. REST API provides endpoints
4. WebSocket broadcasts real-time updates

**Phase 6** will implement the frontend UI for the operator dashboard.

