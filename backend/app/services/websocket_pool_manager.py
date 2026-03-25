"""WebSocket connection pool manager for optimizing WebSocket connections across sessions.

This service manages WebSocket connections to reduce overhead when switching between
different sessions for the same agent.
"""

import asyncio
import uuid
from typing import Dict, List, Tuple, Optional, Set
from collections import defaultdict
from datetime import datetime, timedelta
from loguru import logger

from fastapi import WebSocket, WebSocketDisconnect


class WebSocketPoolManager:
    """Manages a pool of WebSocket connections with support for session reuse and connection health monitoring."""

    def __init__(self, connection_timeout: int = 300, heartbeat_interval: int = 30):
        # agent_id_str -> list of ConnectionInfo tuples (maintaining compatibility with old API)
        self.active_connections: Dict[str, List[Tuple[WebSocket, Optional[str], Set[str]]]] = defaultdict(list)
        self._connection_timeout = connection_timeout  # seconds
        self._heartbeat_interval = heartbeat_interval  # seconds
        self._health_check_task = None
        self._connection_metadata: Dict[WebSocket, Dict] = {}  # Additional metadata for connections

    async def start_health_monitoring(self):
        """Start background task for connection health monitoring."""
        if self._health_check_task is None:
            self._health_check_task = asyncio.create_task(self._connection_health_loop())

    async def stop_health_monitoring(self):
        """Stop the background health monitoring task."""
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
            self._health_check_task = None

    async def _connection_health_loop(self):
        """Background task to monitor connection health and cleanup stale connections."""
        while True:
            try:
                await asyncio.sleep(self._heartbeat_interval)
                await self.cleanup_stale_connections()
            except asyncio.CancelledError:
                logger.info("WebSocket pool health monitoring stopped")
                break
            except Exception as e:
                logger.error(f"Error in WebSocket pool health monitoring: {e}")

    def get_connection_count(self, agent_id: str) -> int:
        """Get the total number of connections for an agent."""
        return len(self.active_connections.get(agent_id, []))

    def get_session_count(self, agent_id: str) -> int:
        """Get the total number of sessions across all connections for an agent."""
        count = 0
        for ws, current_session_id, session_set in self.active_connections.get(agent_id, []):
            count += len(session_set)
        return count

    async def connect(self, agent_id: str, websocket: WebSocket, session_id: str = None):
        """Connect a WebSocket to the pool, potentially reusing an existing connection."""
        await websocket.accept()

        # For backward compatibility, check if there's an existing connection that can be reused
        # but keep the same signature as the original ConnectionManager

        # If no existing connection for this agent, create the initial structure
        if agent_id not in self.active_connections:
            self.active_connections[agent_id] = []

        # Add the new connection with its session ID and set of associated sessions
        session_set = {session_id} if session_id else set()

        # Check if there's an existing connection for this agent that we can reuse
        reuse_found = False
        for i, (ws, current_sid, sess_set) in enumerate(self.active_connections[agent_id]):
            if ws == websocket:
                # This shouldn't happen in normal flow, but just in case
                self.active_connections[agent_id][i] = (websocket, session_id, sess_set)
                reuse_found = True
                break
            elif ws.application_state == 1 and session_id and session_id not in sess_set:
                # Reuse an existing active connection that doesn't already have this session
                # Add the session to the existing set and update
                new_sess_set = sess_set.copy()
                new_sess_set.add(session_id)
                self.active_connections[agent_id][i] = (ws, session_id, new_sess_set)
                reuse_found = True
                break

        # If no suitable connection was found to reuse, add as a new connection
        if not reuse_found:
            self.active_connections[agent_id].append((websocket, session_id, session_set))

        # Store connection metadata
        self._connection_metadata[websocket] = {
            'created_at': datetime.now(),
            'last_activity': datetime.now(),
            'agent_id': agent_id
        }

    def disconnect(self, agent_id: str, websocket: WebSocket):
        """Remove a WebSocket from the pool."""
        if agent_id in self.active_connections:
            # Remove the specific connection
            self.active_connections[agent_id] = [
                (ws, sid, sess_set) for ws, sid, sess_set in self.active_connections[agent_id]
                if ws != websocket
            ]

            # Clean up metadata
            if websocket in self._connection_metadata:
                del self._connection_metadata[websocket]

            # Clean up agent entry if no connections remain
            if not self.active_connections[agent_id]:
                del self.active_connections[agent_id]

    def switch_session(self, agent_id: str, websocket: WebSocket, new_session_id: str) -> bool:
        """Switch the active session for a WebSocket connection."""
        if agent_id in self.active_connections:
            for i, (ws, current_sid, sess_set) in enumerate(self.active_connections[agent_id]):
                if ws == websocket:
                    # Add the new session to the set of sessions for this connection
                    new_sess_set = sess_set.copy()
                    new_sess_set.add(new_session_id)
                    # Update the current session for this connection
                    self.active_connections[agent_id][i] = (ws, new_session_id, new_sess_set)

                    # Update metadata
                    if websocket in self._connection_metadata:
                        self._connection_metadata[websocket]['last_activity'] = datetime.now()

                    return True
        return False

    async def send_message(self, agent_id: str, message: dict, session_id: str = None):
        """Send message to connections associated with the agent and optionally specific session."""
        if agent_id in self.active_connections:
            for ws, current_sid, sess_set in self.active_connections[agent_id]:
                # If session_id is specified, only send to connections that include this session
                if session_id is None or session_id in sess_set:
                    try:
                        await ws.send_json(message)

                        # Update activity timestamp
                        if ws in self._connection_metadata:
                            self._connection_metadata[ws]['last_activity'] = datetime.now()
                    except WebSocketDisconnect:
                        # Remove disconnected connection
                        self.disconnect(agent_id, ws)
                        continue
                    except Exception as e:
                        logger.error(f"Error sending message to WebSocket: {e}")

    def get_active_session_ids(self, agent_id: str) -> List[str]:
        """Return distinct session IDs for all active WS connections of an agent."""
        if agent_id not in self.active_connections:
            return []
        all_sessions = set()
        for _ws, _current_sid, sess_set in self.active_connections[agent_id]:
            all_sessions.update(sess_set)
        return list(all_sessions)

    def get_connection_for_session(self, agent_id: str, session_id: str) -> Optional[WebSocket]:
        """Find the WebSocket connection that handles the given session."""
        if agent_id in self.active_connections:
            for ws, current_sid, sess_set in self.active_connections[agent_id]:
                if session_id in sess_set:
                    return ws
        return None

    async def cleanup_stale_connections(self):
        """Clean up connections that have been inactive beyond the timeout."""
        current_time = datetime.now()
        agents_to_remove = []

        for agent_id, connections in self.active_connections.items():
            active_connections = []
            for ws, current_sid, sess_set in connections:
                # Check if WebSocket is still connected and get metadata
                is_connected = ws.application_state == 1  # WebSocketState.CONNECTED
                last_activity = self._connection_metadata.get(ws, {}).get('last_activity', current_time)

                time_since_activity = (current_time - last_activity).seconds

                if is_connected and time_since_activity < self._connection_timeout:
                    active_connections.append((ws, current_sid, sess_set))
                else:
                    # Remove disconnected or stale connections
                    try:
                        if not is_connected:
                            logger.info(f"Removing disconnected WebSocket for agent {agent_id}")
                        else:
                            logger.info(f"Removing stale WebSocket for agent {agent_id} (inactive for {time_since_activity}s)")
                        await ws.close(code=1000)  # Normal closure
                    except:
                        pass  # Ignore errors during close

            if active_connections:
                self.active_connections[agent_id] = active_connections
            else:
                agents_to_remove.append(agent_id)

        # Remove agents with no active connections
        for agent_id in agents_to_remove:
            if agent_id in self.active_connections:
                del self.active_connections[agent_id]
            # Clean up any remaining metadata for connections from this agent
            connections_to_clean = []
            for ws, meta in self._connection_metadata.items():
                if meta.get('agent_id') == agent_id:
                    connections_to_clean.append(ws)
            for ws in connections_to_clean:
                del self._connection_metadata[ws]