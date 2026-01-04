# Phase 4: Feature Engineering & Anomaly Detection

## Overview

Phase 4 implements feature extraction from telemetry streams and rule-based anomaly detection. This phase does **not** include:
- Operator service implementation
- UI components
- Database schemas
- Any future phase implementations

## Assumptions

### Feature Extraction Strategy

**Chosen**: Event-time windowing with ring buffers

**Rationale**:
- **Event-time semantics**: Uses actual event timestamps, not processing time
- **Bounded memory**: Ring buffers limit memory usage per vehicle
- **Sequential processing**: Maintains ordering within vehicle partitions
- **Robust to delays**: Handles out-of-order events within tolerance

### Anomaly Detection Approach

**Chosen**: Rule-based detection with dataset-grounded thresholds

**Rationale**:
- **Explainability**: Clear rules and thresholds for each anomaly type
- **Transparency**: Each alert includes feature values and thresholds
- **Calibration**: Thresholds derived from dataset statistics (percentiles)
- **Simplicity**: No ML model training required
- **Interpretability**: Operators can understand why alerts were triggered

### Threshold Calibration

**Chosen**: Robust statistics (percentiles) from golden scenes

**Rationale**:
- **Dataset-grounded**: Thresholds reflect actual driving behavior
- **Robust to outliers**: Percentiles are less sensitive to extreme values
- **Calibrated per rule**: Each rule has warning/critical thresholds
- **Reproducible**: Same dataset produces same thresholds

## Feature Engineering

### Per-Vehicle State Management

**Ring Buffer**:
- Size: Last 10 frames per vehicle
- Purpose: Maintain temporal context for feature extraction
- Key: Partitioned by `vehicle_id` (ensures ordering)

**Out-of-Order Handling**:
- Tolerance: 500ms (event-time)
- Behavior: Reject events older than tolerance
- Rationale: Maintains temporal consistency while handling minor delays

**Event-Time Windowing**:
- Window: 1.0 second from latest frame
- Purpose: Extract features from recent history
- Filtering: Only use frames within window

### Extracted Features

#### 1. Instantaneous Acceleration

**Formula**: `acceleration = Δspeed / Δtime`

**Computation**:
- Uses last two frames from ring buffer
- Time delta: `(curr_frame.event_time - prev_frame.event_time).total_seconds()`
- Speed delta: `curr_frame.speed - prev_frame.speed`
- Safety guard: Skip if `dt <= 0` or `dt > 0.5s`

**Units**: m/s²

**Use Case**: Detect sudden deceleration (negative acceleration)

#### 2. Jerk Proxy

**Formula**: `jerk_proxy = Δacceleration`

**Computation**:
- Uses last three frames
- Computes acceleration for each consecutive pair
- Difference: `acceleration_curr - acceleration_prev`

**Units**: m/s³

**Use Case**: Detect rapid changes in acceleration (not used in current rules)

#### 3. Centroid Displacement

**Formula**: `displacement = ||curr_centroid - prev_centroid||`

**Computation**:
- Uses last two frames
- Euclidean distance: `sqrt((x2-x1)² + (y2-y1)²)`
- 2D distance (ignores z-coordinate)

**Units**: meters

**Use Case**: Detect implausible position jumps (perception instability)

#### 4. Velocity Spike

**Formula**: `velocity_spike = ||curr_velocity - prev_velocity||`

**Computation**:
- Uses last two frames
- Euclidean distance: `sqrt((vx2-vx1)² + (vy2-vy1)²)`
- 2D velocity difference

**Units**: m/s

**Use Case**: Detect implausible velocity changes (perception instability)

#### 5. Heading Change Proxy

**Formula**: `heading_change = |curr_yaw - prev_yaw|`

**Computation**:
- Uses last two frames
- Absolute difference in yaw angles
- Handles angle wrapping (not currently implemented)

**Units**: radians

**Use Case**: Detect rapid heading changes (not used in current rules)

#### 6. Active Agent Count

**Formula**: Count of unique `track_id` values per frame

**Computation**:
- Global per-frame tracking
- Updated by main processing loop
- Used for dropout proxy detection

**Units**: count

**Use Case**: Detect sudden loss of tracked agents (dropout proxy)

### Feature Extraction Invariants

- **Minimum history**: Features require at least 2 frames (3 for jerk)
- **Time validation**: Skip if time delta is invalid
- **Null handling**: Return `None` if insufficient history
- **Ordering**: Frames must be in ascending order (enforced by Kafka partitioning)

## Anomaly Detection Rules

### Rule 1: Sudden Deceleration

**Purpose**: Detect abrupt braking or collision events

**Trigger Condition**:
- Negative acceleration exceeds threshold
- Uses event-time windowing (last 1.0 second)

**Severity Mapping**:
- **WARNING**: `acceleration < warning_threshold` (e.g., -4.43 m/s²)
- **CRITICAL**: `acceleration < critical_threshold` (e.g., -20.68 m/s²)

**Features Used**:
- `acceleration`: Instantaneous acceleration from speed delta
- `time_window_ms`: Time window used (500ms typical)

**Thresholds**:
```json
{
  "sudden_deceleration": {
    "warning": -4.43,
    "critical": -20.68
  }
}
```

**Evidence Included**:
- Frame indices in window
- Velocity history
- Acceleration history
- Threshold values

**Applies To**: Both ego and agents

### Rule 2: Perception Instability

**Purpose**: Detect sensor failures or perception errors

**Trigger Conditions** (any of):
1. **Centroid Jump**: Implausible position change
   - `displacement > threshold`
   - WARNING: 1.65m, CRITICAL: 2.95m

2. **Velocity Spike**: Implausible velocity change
   - `velocity_spike > threshold`
   - WARNING: 1.94 m/s, CRITICAL: 13.29 m/s

3. **Label Instability**: Perception confidence drops
   - `|curr_label_prob - prev_label_prob| > threshold`
   - WARNING: 0.0, CRITICAL: 0.013

**Severity Mapping**:
- Highest severity among triggered conditions
- CRITICAL if any critical threshold exceeded
- WARNING if only warning thresholds exceeded

**Features Used**:
- `centroid_displacement`: Position jump magnitude
- `velocity_spike`: Velocity change magnitude
- `label_probability_delta`: Change in perception confidence

**Thresholds**:
```json
{
  "centroid_jump": {
    "warning": 1.65,
    "critical": 2.95
  },
  "velocity_spike": {
    "warning": 1.94,
    "critical": 13.29
  },
  "label_instability": {
    "warning": 0.0,
    "critical": 0.013
  }
}
```

**Evidence Included**:
- Frame indices
- Centroid history
- Velocity history
- Label probability history (if available)
- Threshold values

**Applies To**: Both ego and agents

### Rule 3: Dropout Proxy

**Purpose**: Detect sensor blindness or tracking failures

**Trigger Condition**:
- Sudden drop in active agent count
- `(prev_count - curr_count) > threshold`

**Severity Mapping**:
- **INFO**: Agent count drop exceeds threshold (e.g., 10 agents)

**Features Used**:
- `active_agent_count`: Current frame agent count
- `prev_active_agent_count`: Previous frame agent count
- `agent_count_delta`: Difference between frames

**Thresholds**:
```json
{
  "dropout_proxy": {
    "agent_count_drop_warning": 10
  }
}
```

**Evidence Included**:
- Frame indices
- Agent count history
- Threshold value

**Applies To**: Global (not per-vehicle)

## Threshold Calibration

### Calibration Process

1. **Load golden scenes**: Replay all 3 golden scenes
2. **Extract features**: Compute all features for all vehicles
3. **Compute statistics**: Calculate percentiles per feature
4. **Set thresholds**: Use percentiles as warning/critical thresholds
5. **Store in config**: Save to `config/thresholds.json`

### Calibration Script

```bash
python scripts/calibrate_thresholds.py
```

**Output**: `services/anomaly-service/config/thresholds.json`

**Method**:
- **Warning threshold**: 95th percentile (captures 5% of events)
- **Critical threshold**: 99th percentile (captures 1% of events)
- **Robust statistics**: Uses percentiles to handle outliers

### Threshold Format

```json
{
  "sudden_deceleration": {
    "warning": -4.43,
    "critical": -20.68
  },
  "centroid_jump": {
    "warning": 1.65,
    "critical": 2.95
  },
  "velocity_spike": {
    "warning": 1.94,
    "critical": 13.29
  },
  "label_instability": {
    "warning": 0.0,
    "critical": 0.013
  },
  "dropout_proxy": {
    "agent_count_drop_warning": 10
  }
}
```

## Implementation Components

### Feature Extractor (`features/extractors.py`)

**Responsibilities**:
- Extract features from ring buffer
- Handle insufficient history gracefully
- Validate time deltas
- Compute derived features (acceleration, displacement)

**Key Methods**:
- `extract_acceleration(frames)`: Compute acceleration
- `extract_centroid_displacement(frames)`: Compute position jump
- `extract_velocity_spike(frames)`: Compute velocity change
- `extract_all_features(frames, frame_index)`: Extract all features

### Ring Buffer (`features/windows.py`)

**Responsibilities**:
- Maintain per-vehicle state
- Handle out-of-order events
- Filter frames by event-time window
- Provide ordered frame list

**Key Classes**:
- `TelemetryFrame`: Single frame storage
- `VehicleState`: Per-vehicle ring buffer
- `VehicleStateManager`: Global state manager

**Key Methods**:
- `add_frame(event)`: Add frame to buffer
- `get_frames()`: Get all frames
- `get_windowed_frames(window_seconds)`: Get frames in time window

### Anomaly Rules (`anomalies/rules.py`)

**Responsibilities**:
- Evaluate detection rules
- Map features to severity
- Generate evidence
- Provide explanations

**Key Classes**:
- `AnomalyResult`: Detection result
- `SuddenDecelerationRule`: Deceleration detection
- `PerceptionInstabilityRule`: Perception error detection
- `DropoutProxyRule`: Sensor dropout detection

**Key Methods**:
- `evaluate(event, features, frames)`: Evaluate rule
- Returns `AnomalyResult` with triggered status

### Anomaly Detector (`anomalies/detectors.py`)

**Responsibilities**:
- Orchestrate rule evaluation
- Combine results from all rules
- Return list of triggered anomalies

**Key Classes**:
- `AnomalyDetector`: Main detector class

**Key Methods**:
- `detect(event, features, frames, ...)`: Detect all anomalies
- Returns list of `AnomalyResult` objects

## Kafka Consumer

### Consumer Configuration

**Topic**: `raw_telemetry`
**Consumer Group**: `anomaly-service-group`
**Partitioning**: By `vehicle_id` (ensures ordering)

**Configuration**:
```python
{
    "bootstrap_servers": "localhost:9092",
    "group_id": "anomaly-service-group",
    "auto_offset_reset": "earliest",
    "enable_auto_commit": False,
    "max_poll_records": 100
}
```

### Processing Loop

1. **Poll messages**: Get batch of telemetry events
2. **For each event**:
   - Deserialize `RawTelemetryEvent`
   - Get or create vehicle state
   - Add frame to ring buffer
   - Extract features
   - Detect anomalies
   - Emit `AnomalyEvent` for each detected anomaly
3. **Commit offsets**: After processing batch

### Deduplication

- **In-memory cache**: `(vehicle_id, event_id)` pairs
- **TTL**: 60 seconds
- **Behavior**: Skip duplicate events within TTL window

## Kafka Producer

### Producer Configuration

**Topic**: `anomalies`
**Key**: `vehicle_id` (for partitioning)
**Serialization**: JSON (Pydantic model)

**Configuration**:
```python
{
    "bootstrap_servers": "localhost:9092",
    "acks": "all",
    "retries": 3
}
```

### Message Format

**Schema**: `AnomalyEvent` (Pydantic model)

**Key Fields**:
- `anomaly_id`: UUID for this anomaly
- `event_id`: Links to source telemetry event
- `vehicle_id`: Vehicle identifier
- `anomaly_type`: Rule name (e.g., "sudden_deceleration")
- `severity`: INFO, WARNING, or CRITICAL
- `features`: Feature values used
- `thresholds`: Threshold values used
- `evidence`: Historical data (frame indices, histories)

## What "Good" Output Looks Like

### Feature Extraction

```bash
# Test feature extraction
python -c "
from services.anomaly_service.features.extractors import FeatureExtractor
from services.anomaly_service.features.windows import TelemetryFrame
# Test with sample frames
"
```

**Expected**: Features computed correctly, None for insufficient history.

### Anomaly Detection

```bash
# Start anomaly service
cd services/anomaly-service
python run.py
```

**Expected Output**:
```
2026-01-03 10:00:01 - anomaly - INFO - Anomaly detected: sudden_deceleration for vehicle scene_0_track_42 at frame 156 (severity: WARNING)
2026-01-03 10:00:02 - anomaly - INFO - Anomaly detected: perception_instability for vehicle scene_0_ego at frame 167 (severity: CRITICAL)
```

### Kafka Messages

```bash
# Consume anomalies topic
docker exec fleetops-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic anomalies \
  --from-beginning \
  --max-messages 5
```

**Expected**: JSON messages with `AnomalyEvent` schema, correct severity, features, and thresholds.

## Common Failure Modes and Fixes

### Feature Extraction Issues

**Problem**: `Insufficient history for feature extraction`
- **Fix**: Ensure ring buffer has enough frames (2 for acceleration, 3 for jerk)
- **Fix**: Check vehicle state is being maintained correctly
- **Fix**: Verify events are arriving in order (check Kafka partitioning)

**Problem**: `Invalid time delta`
- **Fix**: Check event timestamps are valid
- **Fix**: Verify time delta is within MAX_DT_SECONDS (0.5s)
- **Fix**: Check for clock skew or timestamp issues

**Problem**: `Features return None`
- **Fix**: This is expected for first few frames (insufficient history)
- **Fix**: Verify ring buffer is accumulating frames
- **Fix**: Check vehicle state manager is working correctly

### Anomaly Detection Issues

**Problem**: No anomalies detected
- **Fix**: Check thresholds are loaded correctly
- **Fix**: Verify thresholds.json exists and has valid values
- **Fix**: Check feature extraction is working
- **Fix**: Verify telemetry events contain expected data

**Problem**: Too many false positives
- **Fix**: Recalibrate thresholds using calibration script
- **Fix**: Adjust percentile thresholds (use higher percentiles)
- **Fix**: Review feature extraction logic

**Problem**: Wrong severity levels
- **Fix**: Check threshold values match expected ranges
- **Fix**: Verify severity mapping logic
- **Fix**: Check feature values are in correct units

### Ring Buffer Issues

**Problem**: Out-of-order events rejected
- **Fix**: Check Kafka partitioning (same vehicle_id → same partition)
- **Fix**: Verify event timestamps are correct
- **Fix**: Adjust OUT_OF_ORDER_TOLERANCE_MS if needed

**Problem**: Ring buffer not accumulating frames
- **Fix**: Check vehicle state manager is creating states
- **Fix**: Verify add_frame() is being called
- **Fix**: Check for errors in processing loop

### Threshold Calibration Issues

**Problem**: Calibration script fails
- **Fix**: Verify dataset path is correct
- **Fix**: Check golden scenes are defined
- **Fix**: Ensure replay service can read dataset
- **Fix**: Verify feature extraction works

**Problem**: Thresholds seem wrong
- **Fix**: Review percentile calculation
- **Fix**: Check dataset statistics
- **Fix**: Manually adjust thresholds if needed

## Verification Checklist

After Phase 4 is complete:

- [ ] Feature extractor computes all features correctly
- [ ] Ring buffer maintains per-vehicle state
- [ ] Out-of-order handling works within tolerance
- [ ] All three anomaly rules are implemented
- [ ] Thresholds are loaded from config
- [ ] Anomaly detection produces correct results
- [ ] Kafka consumer processes telemetry events
- [ ] Kafka producer emits anomaly events
- [ ] Anomaly events include evidence and thresholds
- [ ] Severity mapping works correctly
- [ ] Threshold calibration script produces valid thresholds

## Next Steps

After Phase 4 is complete:
1. Feature extraction is working
2. Anomaly detection rules are implemented
3. Anomalies are emitted to Kafka

**Phase 5** will implement the operator service for alert management and REST API.

