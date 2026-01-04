#!/bin/bash
# Check for Kafka cluster ID mismatch and fix it automatically
# This prevents the "InconsistentClusterIdException" error

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}Checking for Kafka cluster ID mismatch...${NC}"

# Check if Kafka container exists and is running
if ! docker ps --format '{{.Names}}' | grep -q "^fleetops-kafka$"; then
    echo -e "${GREEN}✓ Kafka container not running - no check needed${NC}"
    exit 0
fi

# Check Kafka logs for cluster ID mismatch error
KAFKA_LOGS=$(docker logs fleetops-kafka 2>&1 | tail -50)
if echo "$KAFKA_LOGS" | grep -q "InconsistentClusterIdException"; then
    echo -e "${RED}✗ Cluster ID mismatch detected!${NC}"
    echo -e "${YELLOW}Kafka's stored cluster ID doesn't match Zookeeper's cluster ID.${NC}"
    echo -e "${YELLOW}This happens when Zookeeper is reset but Kafka's data volume persists.${NC}"
    echo ""
    echo -e "${BLUE}Attempting automatic fix...${NC}"
    
    # Stop Kafka
    echo -e "${BLUE}Stopping Kafka container...${NC}"
    docker-compose stop kafka 2>/dev/null || true
    
    # Remove Kafka volume (this will delete all Kafka data)
    echo -e "${BLUE}Removing corrupted Kafka volume...${NC}"
    docker volume rm autonomous-fleet-response-system_kafka_data 2>/dev/null || {
        # Try alternative volume name format
        docker volume rm fleetops_kafka_data 2>/dev/null || {
            echo -e "${YELLOW}Volume not found or already removed${NC}"
        }
    }
    
    # Restart Kafka
    echo -e "${BLUE}Restarting Kafka with fresh volume...${NC}"
    docker-compose up -d kafka
    
    # Wait for Kafka to be healthy
    echo -e "${BLUE}Waiting for Kafka to become healthy...${NC}"
    max_attempts=30
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if docker inspect --format='{{.State.Health.Status}}' fleetops-kafka 2>/dev/null | grep -q "healthy"; then
            echo -e "${GREEN}✓ Kafka is now healthy!${NC}"
            exit 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}✗ Kafka failed to become healthy after fix attempt${NC}"
    echo -e "${YELLOW}Check logs with: docker logs fleetops-kafka${NC}"
    exit 1
else
    # Check if Kafka is restarting repeatedly (another sign of the issue)
    RESTART_COUNT=$(docker inspect --format='{{.RestartCount}}' fleetops-kafka 2>/dev/null || echo "0")
    if [ "$RESTART_COUNT" -gt 5 ]; then
        echo -e "${YELLOW}⚠ Kafka has restarted $RESTART_COUNT times - checking for issues...${NC}"
        # Check recent logs for errors
        RECENT_LOGS=$(docker logs fleetops-kafka --tail 20 2>&1)
        if echo "$RECENT_LOGS" | grep -q "InconsistentClusterIdException\|clusterId.*doesn't match"; then
            echo -e "${RED}✗ Cluster ID mismatch detected in recent logs!${NC}"
            echo -e "${BLUE}Run: make kafka-reset${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ No cluster ID mismatch detected${NC}"
    exit 0
fi

