# WebSocket Issues and Fixes

## Issues Found

### 1. Operator Service Not Running
**Problem**: The operator service has import/module issues preventing it from starting.

**Error**: `ModuleNotFoundError: No module named 'operator_service.config'`

**Solution**: The `run.py` script has issues with relative imports. Use the start script instead:
```bash
./scripts/start_all.sh
```

Or start manually from project root:
```bash
cd /Users/daivikpurani/Desktop/Repos/Autonomous-Fleet-Response-System
PYTHONPATH=/Users/daivikpurani/Desktop/Repos/Autonomous-Fleet-Response-System python services/operator-service/run.py 8003
```

### 2. Multiple WebSocket Connections
**Problem**: The frontend creates TWO separate WebSocket connections:
- One in `App.tsx` for vehicle updates
- One in `useAlerts.ts` for alert updates

**Impact**: 
- Inefficient (2 connections instead of 1)
- Both connections receive all messages, causing duplicate processing
- Higher server load

**Solution**: Create a shared WebSocket context/provider that all components can use.

### 3. WebSocket Message Handling
**Current Behavior**:
- `App.tsx` only handles `vehicle_updated` messages
- `useAlerts.ts` only handles `alert_created` and `alert_updated` messages
- Both create separate connections

**Expected**: Single connection that routes messages to appropriate handlers.

## Monitoring WebSocket Exchanges

Use the test script to monitor WebSocket messages:
```bash
python3 test_websocket.py
```

Or use browser DevTools:
1. Open browser console (F12)
2. Go to Network tab
3. Filter by WS (WebSocket)
4. Click on the WebSocket connection
5. View Messages tab to see all exchanges

## Testing WebSocket Connection

```bash
# Test if operator service is running
curl http://localhost:8003/health

# Test WebSocket connection (requires websockets package)
python3 test_websocket.py
```

## Next Steps

1. Fix operator service startup (use start_all.sh script)
2. Refactor frontend to use single WebSocket connection
3. Monitor WebSocket exchanges to verify messages are being sent/received
4. Check browser console for WebSocket errors

