#!/bin/bash
# Clawith — Stop Script
# Usage: ./stop.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$ROOT/.data"
PID_DIR="$DATA_DIR/pid"
LOG_DIR="$DATA_DIR/log"

BACKEND_PORT=8008
FRONTEND_PORT=3008
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping clawith services...${NC}"

# ─── Docker 模式 ───
if command -v docker &>/dev/null && docker ps --filter 'name=clawith' --filter 'status=running' -q 2>/dev/null | grep -q .; then
    DIR_NAME=$(basename "$(dirname "$ROOT")")
    [ -z "$DIR_NAME" ] && DIR_NAME="custom"
    PROJECT_NAME="clawith-${DIR_NAME}"
    export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
    
    echo -e "${YELLOW}🐳 Stopping Docker containers...${NC}"
    docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    echo -e "${GREEN}✅ Docker containers stopped${NC}"
fi

# ─── 本地模式 ───
for pidfile in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [ -f "$pidfile" ]; then
        PID=$(cat "$pidfile")
        if kill -0 "$PID" 2>/dev/null; then
            kill -15 "$PID" 2>/dev/null || true
            sleep 1
            # 强制终止
            kill -9 "$PID" 2>/dev/null || true
            echo -e "  ${GREEN}✅ Stopped PID $PID ($(basename "$pidfile" .pid))${NC}"
        fi
        rm -f "$pidfile"
    fi
done

# ─── 按端口终止 ───
for port in $BACKEND_PORT $FRONTEND_PORT; do
    if command -v lsof &>/dev/null; then
        PIDS=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            echo -e "${YELLOW}⚠️  Killing processes on port $port...${NC}"
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
        fi
    elif command -v fuser &>/dev/null; then
        fuser -k $port/tcp 2>/dev/null || true
    fi
done

echo -e "${GREEN}✅ All services stopped${NC}"
