#!/bin/bash
# Reset Kafka and Zookeeper to fix cluster ID mismatch issues
# This script stops containers, removes volumes, and restarts with fresh state

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Resetting Kafka and Zookeeper${NC}"
echo -e "${BLUE}========================================${NC}"

# Stop containers
echo -e "${BLUE}Stopping containers...${NC}"
docker-compose stop kafka zookeeper 2>/dev/null || true
docker-compose rm -f kafka zookeeper 2>/dev/null || true

# Remove volumes
echo -e "${BLUE}Removing Kafka and Zookeeper volumes...${NC}"
docker volume rm autonomous-fleet-response-system_kafka_data autonomous-fleet-response-system_zookeeper_data 2>/dev/null || {
    echo -e "${YELLOW}Volumes may not exist, continuing...${NC}"
}

# Restart services
echo -e "${BLUE}Starting Kafka and Zookeeper with fresh volumes...${NC}"
docker-compose up -d zookeeper kafka

# Wait for services to be healthy
echo -e "${BLUE}Waiting for services to be healthy...${NC}"
sleep 5

# Check health
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if docker inspect --format='{{.State.Health.Status}}' fleetops-kafka 2>/dev/null | grep -q "healthy"; then
        echo -e "${GREEN}✓ Kafka is healthy${NC}"
        break
    fi
    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}✗ Kafka failed to become healthy after $max_attempts attempts${NC}"
        echo -e "${YELLOW}Check logs with: docker logs fleetops-kafka${NC}"
        exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Kafka and Zookeeper reset complete!${NC}"
echo -e "${GREEN}========================================${NC}"

