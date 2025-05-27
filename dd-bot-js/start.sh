#!/bin/bash
# Script to start the DD_Bot JavaScript version

# Set terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}DD_Bot JavaScript${NC} - A Discord Bot to control Docker containers"
echo "==============================================================="

# Check if .env file exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}Warning:${NC} .env file not found. Creating one..."
  echo "DISCORD_TOKEN=" > .env
  echo -e "${YELLOW}Please edit the .env file and add your Discord token.${NC}"
  exit 1
fi

# Check if Discord token is set
if grep -q "DISCORD_TOKEN=$" .env; then
  echo -e "${RED}Error:${NC} Discord token not set in .env file."
  echo -e "${YELLOW}Please edit the .env file and add your Discord token.${NC}"
  exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm install
fi

# Start the bot
echo -e "${GREEN}Starting DD_Bot...${NC}"
npm start
