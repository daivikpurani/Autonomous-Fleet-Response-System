# Architecture

## Overview

The Autonomous Fleet Response System is a microservices-based architecture that processes vehicle telemetry from the L5Kit dataset, detects anomalies in real-time via Kafka streaming, and provides an operator dashboard for monitoring and intervention.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Autonomous Fleet Response System                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   L5Kit      │    │   Replay     │    │   Anomaly    │    │  Operator    │   │
│  │   Dataset    │───▶│   Service    │───▶│   Service    │───▶│   Service    │   │
│  │  (sample.zarr)│    │   (8000)     │    │  (Consumer)  │    │   (8003)     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘   │
│                             │                   │                   │            │
│                             │                   │                   │            │
│                             ▼                   ▼                   ▼            │
│                      ┌──────────────────────────────────────────────────┐       │
│                      │                    Kafka                          │       │
│                      │  ┌─────────────┐ ┌───────────┐ ┌────────────────┐│       │
│                      │  │raw_telemetry│ │ anomalies │ │operator_actions││       │
│                      │  └─────────────┘ └───────────┘ └────────────────┘│       │
│                      └──────────────────────────────────────────────────┘       │
│                                                             │                    │
│                                                             │                    │
│  ┌──────────────┐                            ┌──────────────┴────────────┐      │
│  │  PostgreSQL  │◀───────────────────────────│        Frontend UI        │      │
│  │   (5432)     │                            │    (Vite + React - 5173)  │      │
│  └──────────────┘                            └───────────────────────────┘      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Services

### 1. Replay Service (`services/replay-service/`)

**Purpose**: Reads L5Kit zarr dataset and replays vehicle telemetry to Kafka at a fixed rate.

**Responsibilities**:
- Load and parse L5Kit zarr dataset (scenes, frames, agents)
- Normalize telemetry data (centroid, velocity, yaw)
- Replay frames at fixed 10 Hz rate
- Emit `RawTelemetryEvent` messages to `raw_telemetry` Kafka topic
- Maintain deterministic replay ordering (scenes in order, frames in ascending order)

**Key Components**:
- `dataset/reader.py`: Zarr dataset reader with lazy loading
- `dataset/normalizer.py`: Telemetry normalization (handles 2D/3D coordinates)
- `replay/engine.py`: Deterministic replay loop orchestration
- `replay/scheduler.py`: Fixed-rate frame timing (10 Hz)
- `kafka_producer.py`: Kafka producer wrapper with JSON serialization

**API Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/replay/start` | POST | Start replay (optionally specify scene_ids) |
| `/replay/stop` | POST | Stop active replay |
| `/replay/status` | GET | Get current replay status |
| `/health` | GET | Health check |

**Port**: 8000

---

### 2. Anomaly Service (`services/anomaly-service/`)

**Purpose**: Consumes raw telemetry events, extracts features, and detects anomalies using rule-based logic.

**Responsibilities**:
- Consume `RawTelemetryEvent` from `raw_telemetry` topic
- Maintain per-vehicle state using ring buffers (last 10 frames)
- Extract features (acceleration, displacement, speed changes)
- Apply rule-based anomaly detection with calibrated thresholds
- Emit `AnomalyEvent` messages to `anomalies` topic

**Anomaly Detection Rules**:

| Rule | Description | Severity |
|------|-------------|----------|
| `sudden_deceleration` | Large negative acceleration exceeding threshold | WARNING / CRITICAL |
| `perception_instability` | Implausible centroid jumps, velocity spikes, or label probability changes | WARNING / CRITICAL |
| `dropout_proxy` | Sudden drop in active agent count or track continuity gaps | INFO |

**Threshold Configuration**:
Thresholds are calibrated from the golden scenes using robust statistics (percentiles) and stored in `config/thresholds.json`:

```json
{
  "sudden_deceleration": { "warning": -4.43, "critical": -20.68 },
  "centroid_jump": { "warning": 1.65, "critical": 2.95 },
  "velocity_spike": { "warning": 1.94, "critical": 13.29 },
  "label_instability": { "warning": 0.0, "critical": 0.013 },
  "dropout_proxy": { "agent_count_drop_warning": 10 }
}
```

**Key Components**:
- `features/extractors.py`: Feature computation (acceleration, displacement)
- `features/windows.py`: Per-vehicle state management with ring buffers
- `anomalies/rules.py`: Rule implementations (SuddenDeceleration, PerceptionInstability, DropoutProxy)
- `anomalies/detectors.py`: Rule orchestration
- `kafka_consumer.py`: Kafka consumer with event deserialization
- `kafka_producer.py`: Kafka producer for anomaly events

**Runtime**: Runs as a Kafka consumer (no HTTP server)

---

### 3. Operator Service (`services/operator-service/`)

**Purpose**: Manages alert lifecycle, provides REST API and WebSocket for the operator dashboard.

**Responsibilities**:
- Consume `AnomalyEvent` from `anomalies` topic
- Consume `RawTelemetryEvent` from `raw_telemetry` topic (for vehicle position updates)
- Create and manage alerts in PostgreSQL
- Aggregate multiple anomalies into single alerts per vehicle/rule
- Provide REST API for alert management
- Broadcast real-time updates via WebSocket
- Track vehicle state and operator actions

**Alert Lifecycle**:
```
OPEN → ACKNOWLEDGED → RESOLVED
```

**Key Components**:
- `services/alert_service.py`: Alert creation and aggregation logic
- `services/vehicle_state_service.py`: Vehicle state tracking
- `services/action_service.py`: Operator action handling
- `db/models.py`: SQLAlchemy models (Alert, VehicleState, Action)
- `api/alerts.py`: REST endpoints for alerts
- `api/vehicles.py`: REST endpoints for vehicles
- `api/actions.py`: REST endpoints for actions
- `websocket/handler.py`: WebSocket manager for real-time broadcasts
- `kafka_consumer.py`: Dual consumer for anomalies and telemetry

**API Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/alerts` | GET | List alerts (with optional filters) |
| `/alerts/{alert_id}` | GET | Get single alert |
| `/alerts/{alert_id}/ack` | POST | Acknowledge alert |
| `/alerts/{alert_id}/resolve` | POST | Resolve alert |
| `/vehicles` | GET | List all vehicles |
| `/vehicles/{vehicle_id}` | GET | Get vehicle details |
| `/actions` | GET | List operator actions |
| `/ws` | WebSocket | Real-time event stream |
| `/health` | GET | Health check |

**WebSocket Events**:
- `alert_created`: New alert created
- `alert_updated`: Alert status changed
- `vehicle_updated`: Vehicle position/state changed
- `operator_action_created`: New operator action

**Port**: 8003

---

### 4. Frontend UI (`ui/`)

**Purpose**: React-based operator dashboard for monitoring vehicles and managing alerts.

**Features**:
- Real-time vehicle map with position updates
- Alert list with severity indicators
- Vehicle detail panel
- Incident evidence viewer
- Operator action buttons (Acknowledge, Resolve)
- Demo mode for automated workflow

**Key Components**:
- `components/MapView.tsx`: 2D vehicle position visualization
- `components/VehicleLayer.tsx`: Vehicle markers with alert indicators
- `components/AlertList.tsx`: Sortable alert list with severity badges
- `components/VehicleDetail.tsx`: Vehicle information panel
- `components/IncidentPanel.tsx`: Alert evidence and feature display
- `components/ActionButtons.tsx`: Acknowledge/Resolve actions
- `hooks/useWebSocket.ts`: WebSocket connection management
- `services/api.ts`: REST API client

**Port**: 5173 (Vite dev server)

---

## Data Flow

### Message Flow Through Kafka Topics

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              Data Flow                                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Dataset → Replay Service                                                │
│     ┌─────────────┐                                                         │
│     │ sample.zarr │──read frames──▶ TelemetryNormalizer ──▶ RawTelemetryEvent│
│     └─────────────┘                                                         │
│                                                                             │
│  2. Replay Service → Kafka (raw_telemetry)                                  │
│     RawTelemetryEvent ──produce──▶ raw_telemetry topic (partition by vehicle_id)│
│                                                                             │
│  3. Kafka → Anomaly Service                                                 │
│     raw_telemetry ──consume──▶ FeatureExtractor ──▶ AnomalyDetector        │
│                                                                             │
│  4. Anomaly Service → Kafka (anomalies)                                     │
│     AnomalyEvent ──produce──▶ anomalies topic (partition by vehicle_id)     │
│                                                                             │
│  5. Kafka → Operator Service                                                │
│     anomalies ──consume──▶ AlertService ──▶ PostgreSQL (alerts)            │
│     raw_telemetry ──consume──▶ VehicleStateService ──▶ PostgreSQL (vehicles)│
│                                                                             │
│  6. Operator Service → Frontend                                             │
│     PostgreSQL ◀──REST API──▶ Frontend                                     │
│     WebSocket ◀──broadcasts──▶ Frontend (real-time updates)                │
│                                                                             │
│  7. Frontend → Operator Service                                             │
│     Operator actions (ack/resolve) ──REST API──▶ ActionService             │
│                                                                             │
│  8. Operator Service → Kafka (operator_actions)                             │
│     OperatorActionEvent ──produce──▶ operator_actions topic                 │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Kafka Topics

| Topic | Partitions | Key | Producer | Consumer |
|-------|------------|-----|----------|----------|
| `raw_telemetry` | 6 | `vehicle_id` | Replay Service | Anomaly Service, Operator Service |
| `anomalies` | 6 | `vehicle_id` | Anomaly Service | Operator Service |
| `operator_actions` | 3 | `action_id` | Operator Service | (audit/logging) |

### Per-Vehicle Ordering Guarantees

- All events for the same `vehicle_id` go to the same partition
- Events are processed in order within a partition
- This ensures:
  - Correct feature extraction (requires sequential frames)
  - Accurate acceleration/displacement calculations
  - Proper alert aggregation

---

## Deployment

### Local Development Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Local Development Setup                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Docker Compose (Infrastructure)                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │ │
│  │  │  PostgreSQL │  │  Zookeeper  │  │    Kafka    │                │ │
│  │  │    :5432    │  │    :2181    │  │    :9092    │                │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Python Services (uvicorn)                                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │ │
│  │  │   Replay    │  │   Anomaly   │  │  Operator   │                │ │
│  │  │   :8000     │  │  (consumer) │  │   :8003     │                │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Frontend (Vite)                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────┐                                                   │ │
│  │  │  React UI   │                                                   │ │
│  │  │   :5173     │                                                   │ │
│  │  └─────────────┘                                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Starting the System

**Quick Start**:
```bash
# Start all services
./scripts/start_all.sh

# Or with auto-reload for development
./scripts/start_all.sh --reload
```

**Manual Start**:
```bash
# 1. Start infrastructure
make up

# 2. Start replay service
cd services/replay-service && uvicorn main:app --port 8000

# 3. Start anomaly service
cd services/anomaly-service && python run.py

# 4. Start operator service
cd services/operator-service && uvicorn main:app --port 8003

# 5. Start frontend
cd ui && npm run dev
```

### Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `KAFKA_PORT` | 9092 | Kafka broker port |
| `L5KIT_DATASET_PATH` | `dataset/sample.zarr` | Path to L5Kit dataset |
| `REPLAY_RATE_HZ` | 10 | Replay rate in Hz |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/fleetops` | Database connection |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka bootstrap servers |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Python 3.10+, FastAPI, uvicorn |
| **Database** | PostgreSQL 15, SQLAlchemy, Alembic |
| **Messaging** | Apache Kafka (Confluent Platform 7.5) |
| **Dataset** | L5Kit zarr format |
| **Infrastructure** | Docker Compose |

---

## Design Decisions

### Why Kafka for Messaging?

- **Ordering guarantees**: Partition by `vehicle_id` ensures per-vehicle ordering
- **Durability**: Messages persist for replay and debugging
- **Decoupling**: Services operate independently
- **Scalability**: Can add more partitions/consumers as needed

### Why PostgreSQL for Alert Storage?

- **ACID compliance**: Ensures alert state consistency
- **Rich queries**: Support for filtering, sorting, aggregation
- **WebSocket integration**: Can broadcast on insert/update
- **Audit trail**: Full history of alerts and actions

### Why Rule-Based Anomaly Detection?

- **Explainability**: Clear thresholds and feature values
- **Calibration**: Thresholds derived from dataset statistics
- **Transparency**: Each alert includes evidence (features, thresholds)
- **Simplicity**: No ML model training required for demo

### Why Fixed 10 Hz Replay Rate?

- **Determinism**: Reproducible demo runs
- **Realism**: Matches typical telemetry update rates
- **Manageability**: Allows real-time processing without overwhelming consumers
