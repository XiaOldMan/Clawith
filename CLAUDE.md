# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clawith is an open-source multi-agent collaboration platform. Each AI agent has a persistent identity, long-term memory, and its own workspace. Agents can work together as a crew with humans via a web interface.

## Common Commands

### Setup
```bash
bash setup.sh           # Production: installs runtime dependencies
bash setup.sh --dev    # Development: also installs pytest and ruff
```

### Running the Application
```bash
bash restart.sh                    # Start all services
bash restart.sh --source           # Non-Docker mode (direct processes)
```

- Frontend: http://localhost:3008
- Backend: http://localhost:8008

### Backend Development
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8008 --reload

# Run tests
pytest

# Lint (ruff configured in pyproject.toml)
ruff check .
ruff format .
```

### Frontend Development
```bash
cd frontend
npm run dev
npm run build
```

## Architecture

### Backend Structure
```
backend/app/
├── api/           # 30+ FastAPI route modules (agents.py, websocket.py, skills.py, etc.)
├── services/      # Core business logic (agent_manager, llm_client, scheduler, trigger_daemon)
├── models/        # SQLAlchemy ORM models
├── schemas/       # Pydantic request/response schemas
├── core/          # Core utilities (auth, security)
└── main.py        # FastAPI application entry point
```

### Key Services
- `agent_manager.py` - Agent lifecycle management
- `llm_client.py` - LLM API integration (OpenAI, Anthropic, etc.)
- `trigger_daemon.py` - Background job scheduler (cron, interval, webhook triggers)
- `autonomy_service.py` - Agent autonomous awareness system
- `mcp_client.py` - Model Context Protocol client

### Frontend Structure
```
frontend/src/
├── pages/         # React page components
├── components/    # Reusable UI components
├── services/      # API clients, WebSocket handling
└── stores/        # Zustand state management
```

## Database

- Uses SQLAlchemy async with `asyncpg` (PostgreSQL) or `aiosqlite`
- Alembic for migrations (`backend/alembic/`)
- Migrations run automatically on startup via `app/database.py`

## Key Configuration

- Environment variables in `.env` (copy from `.env.example`)
- `SECRET_KEY` and `JWT_SECRET_KEY` must be set for production
- `DATABASE_URL` defaults to PostgreSQL at `postgresql+asyncpg://clawith:clawith@localhost:5432/clawith`

## Agent Workspace

Agent files (soul.md, memory.md, skills, workspace) stored at:
- Local: `backend/agent_data/<agent-id>/`
- Docker: `/data/agents/` inside container