#!/usr/bin/env python3
"""Test WebSocket connection and monitor exchanges."""

import asyncio
import json
import websockets
import sys

async def test_websocket():
    """Connect to WebSocket and monitor messages."""
    uri = "ws://localhost:8003/ws"
    
    print(f"Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✓ WebSocket connected successfully!")
            print("Waiting for messages... (Press Ctrl+C to stop)\n")
            
            # Send a test message (optional)
            # await websocket.send(json.dumps({"type": "ping"}))
            
            # Listen for messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    print(f"📨 Received message:")
                    print(f"   Type: {data.get('type', 'unknown')}")
                    print(f"   Data keys: {list(data.get('data', {}).keys())}")
                    print(f"   Full message: {json.dumps(data, indent=2)}")
                    print("-" * 60)
                except json.JSONDecodeError:
                    print(f"⚠️  Received non-JSON message: {message}")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
                    
    except websockets.exceptions.ConnectionRefused:
        print(f"❌ Connection refused. Is the operator service running on port 8003?")
        print("   Start it with: cd services/operator-service && uvicorn main:app --port 8003")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(test_websocket())
    except KeyboardInterrupt:
        print("\n\n👋 Disconnected")

