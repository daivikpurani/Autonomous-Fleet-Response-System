# Troubleshooting Guide

## Kafka Cluster ID Mismatch

### Problem
Kafka fails to start with error:
```
kafka.common.InconsistentClusterIdException: The Cluster ID ... doesn't match stored clusterId ... in meta.properties
```

### Cause
This happens when Zookeeper is reset (or its volume is recreated) but Kafka's data volume persists. Kafka stores a cluster ID that must match Zookeeper's cluster ID.

### Prevention
The system now automatically detects and fixes this issue:
- `make up` checks for cluster ID mismatch before reporting health
- `make health` checks for this issue if Kafka is unhealthy
- `./scripts/start_all.sh` automatically detects and fixes the issue

### Manual Fix

**Option 1: Use the automated script**
```bash
make kafka-reset
```

**Option 2: Manual steps**
```bash
# Stop Kafka
docker-compose stop kafka

# Remove Kafka volume (WARNING: This deletes all Kafka data)
docker volume rm autonomous-fleet-response-system_kafka_data

# Restart Kafka
docker-compose up -d kafka

# Verify health
make health
```

**Option 3: Reset all volumes**
```bash
make reset  # Resets all volumes (Postgres, Kafka, Zookeeper)
```

### Detection

Check for cluster ID mismatch:
```bash
make kafka-check
```

Or manually check logs:
```bash
docker logs fleetops-kafka | grep -i "InconsistentClusterIdException"
```

### When This Happens

Common scenarios:
1. Zookeeper volume was deleted/recreated but Kafka volume wasn't
2. Docker volumes were manually manipulated
3. System was reset partially (only some volumes cleared)

### Best Practices

1. **Always reset both Kafka and Zookeeper together**:
   ```bash
   make kafka-reset  # Resets both Kafka and Zookeeper
   ```

2. **Use `make reset` for complete reset**:
   ```bash
   make reset  # Resets all infrastructure volumes
   ```

3. **Check health after infrastructure changes**:
   ```bash
   make health
   ```

## Other Common Issues

### Kafka Not Starting

**Symptoms**: Kafka container keeps restarting

**Check**:
```bash
docker logs fleetops-kafka
```

**Common causes**:
- Cluster ID mismatch (see above)
- Port 9092 already in use
- Insufficient memory

**Solutions**:
- Run `make kafka-check` to detect cluster ID issues
- Check port: `lsof -i :9092`
- Increase Docker memory limits

### WebSocket Connection Issues

**Symptoms**: Frontend shows "Disconnected" status

**Check**:
1. Is operator service running?
   ```bash
   curl http://localhost:8003/health
   ```

2. Check operator service logs:
   ```bash
   # Find the process
   ps aux | grep operator-service
   
   # Or check if using start script
   ./scripts/start_all.sh
   ```

3. Check browser console (F12) for WebSocket errors

**Solutions**:
- Start operator service: `./scripts/start_all.sh`
- Check CORS settings in operator service
- Verify WebSocket URL in frontend matches backend

### Database Connection Issues

**Symptoms**: Services can't connect to PostgreSQL

**Check**:
```bash
make health
docker logs fleetops-postgres
```

**Solutions**:
- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check DATABASE_URL environment variable
- Verify port 5432 (or configured port) is accessible

### Port Conflicts

**Symptoms**: Services fail to start with "port already in use"

**Check**:
```bash
# Check what's using the port
lsof -i :8000  # Replay service
lsof -i :8003  # Operator service
lsof -i :9092  # Kafka
lsof -i :5173  # Frontend
```

**Solutions**:
- Stop conflicting services
- Change port in `.env` file
- Kill process using the port (use PID from lsof output)

