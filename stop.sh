#!/bin/bash
# Clawith — Stop Script
# 停止 setup.sh 和 restart.sh 创建的所有资源

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.data/pid"

BACKEND_PORT=8008
FRONTEND_PORT=3008
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

# ─── 日志 ───
log()  { echo -e "${GREEN}[stop]${NC} $*"; }
warn() { echo -e "${YELLOW}[stop] WARNING:${NC} $*"; }

# ─── 终止进程（带 PID 文件验证）───
# 用法: stop_pid "backend" "$BACKEND_PID"
stop_pid() {
    local name=$1 pidfile=$2
    [ ! -f "$pidfile" ] && return 0
    local pid
    pid=$(cat "$pidfile" 2>/dev/null)
    [ -z "$pid" ] && { rm -f "$pidfile"; return 0; }
    
    # 验证进程是否存在
    if ! kill -0 "$pid" 2>/dev/null; then
        warn "$name PID $pid stale, removing pidfile"
        rm -f "$pidfile"
        return 0
    fi
    
    # 验证进程身份：检查是否是我们启动的进程
    local cmd=""
    if [ -f "/proc/$pid/cmdline" ]; then
        # Linux
        cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    else
        # macOS
        cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    fi
    
    # 检查命令行是否包含项目路径或服务名
    # 必须包含 ROOT 或 uvicorn/vite（服务名）
    if [ -n "$cmd" ] && ! echo "$cmd" | grep -qE "($ROOT|uvicorn|vite)"; then
        warn "$name PID $pid does not match project, skipping"
        rm -f "$pidfile"
        return 0
    fi
    
    # 优雅停止：先 SIGTERM，等 1s，再 SIGKILL
    kill -15 "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
    fi
    log "$name stopped (PID $pid)"
    rm -f "$pidfile"
}

# ─── 停止 Docker ───
stop_docker() {
    if command -v docker >/dev/null 2>&1 && \
       docker ps --filter 'name=clawith' --filter 'status=running' -q 2>/dev/null | grep -q .; then
        local dir_name
        dir_name=$(basename "$(dirname "$ROOT")")
        [ -z "$dir_name" ] && dir_name="custom"
        local project_name="clawith-${dir_name}"
        log "Stopping Docker containers (project: $project_name)..."
        export COMPOSE_PROJECT_NAME="$project_name"
        docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    fi
}

# ─── PostgreSQL 连接处理 ───
# PostgreSQL 是系统共享服务，不停止服务本身
# Backend/Frontend 停止后连接会自动断开
stop_postgres() {
    # 不做任何操作，PostgreSQL 由系统管理
    # Backend 停止后数据库连接会自动释放
    log "PostgreSQL is system-managed, not stopping"
}

# ─── 主流程 ───
main() {
    local remaining
    echo ""
    log "Stopping clawith services..."
    echo ""

    # 1. 通过 PID 文件停止 backend 和 frontend
    stop_pid "Backend" "$BACKEND_PID"
    stop_pid "Frontend" "$FRONTEND_PID"

    # 2. 清理残留端口（安全网）
    for port in $BACKEND_PORT $FRONTEND_PORT; do
        remaining=$(lsof -ti :"$port" 2>/dev/null || true)
        if [ -n "$remaining" ]; then
            warn "Port $port still in use, forcing..."
            echo "$remaining" | xargs kill -9 2>/dev/null || true
        fi
    done

    # 3. 停止 Docker 容器
    stop_docker

    # 4. 停止本地 PostgreSQL
    stop_postgres

    echo ""
    log "All services stopped"
}

main "$@"
