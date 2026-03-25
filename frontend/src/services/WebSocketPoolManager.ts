/**
 * WebSocketPoolManager - Manages WebSocket connections for different agents and sessions
 * to optimize connection reuse and reduce overhead when switching between sessions.
 */

interface WebSocketConnection {
  ws: WebSocket;
  agentId: string;
  activeSessionId: string | null;
  associatedSessions: Set<string>;
  createdAt: Date;
  lastActivity: Date;
  isConnected: boolean;
}

class WebSocketPoolManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private connectionTimeout: number = 300000; // 5 minutes in milliseconds
  private heartbeatInterval: number = 30000; // 30 seconds in milliseconds
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(timeoutMs: number = 300000, heartbeatMs: number = 30000) {
    this.connectionTimeout = timeoutMs;
    this.heartbeatInterval = heartbeatMs;
  }

  /**
   * Start the health monitoring for connections
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, this.heartbeatInterval);
  }

  /**
   * Stop the health monitoring for connections
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get or create a WebSocket connection for the specified agent
   */
  getOrCreateConnection(agentId: string, token: string, sessionParam: string = ''): WebSocketConnection {
    // Look for an existing connection for this agent that is still active
    for (const [key, conn] of this.connections.entries()) {
      if (conn.agentId === agentId &&
          conn.isConnected &&
          (Date.now() - conn.lastActivity.getTime()) < this.connectionTimeout) {

        // Reuse existing connection
        conn.lastActivity = new Date();
        return conn;
      }
    }

    // Create new connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat/${agentId}?token=${token}${sessionParam}`;
    const ws = new WebSocket(wsUrl);

    const connectionId = `${agentId}-${Date.now()}`;
    const connection: WebSocketConnection = {
      ws,
      agentId,
      activeSessionId: sessionParam.includes('session_id=')
        ? new URLSearchParams(sessionParam.substring(1)).get('session_id')
        : null,
      associatedSessions: sessionParam.includes('session_id=')
        ? new Set([new URLSearchParams(sessionParam.substring(1)).get('session_id')!])
        : new Set(),
      createdAt: new Date(),
      lastActivity: new Date(),
      isConnected: false
    };

    // Set up connection event handlers
    ws.onopen = () => {
      connection.isConnected = true;
      connection.lastActivity = new Date();
    };

    ws.onclose = () => {
      connection.isConnected = false;
      this.removeConnection(connectionId);
    };

    ws.onerror = () => {
      connection.lastActivity = new Date();
    };

    ws.onmessage = (event) => {
      connection.lastActivity = new Date();
    };

    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Switch the active session for an existing WebSocket connection
   */
  switchSession(ws: WebSocket, newSessionId: string): boolean {
    for (const [_, conn] of this.connections.entries()) {
      if (conn.ws === ws) {
        // Add the new session to the set of associated sessions
        conn.associatedSessions.add(newSessionId);
        // Update the active session
        conn.activeSessionId = newSessionId;
        conn.lastActivity = new Date();

        // Send session switch message if connection is open
        if (conn.isConnected && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'switch_session',
            session_id: newSessionId
          }));
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Send a message through the WebSocket connection for a specific agent/session
   */
  sendMessage(agentId: string, message: any, sessionId?: string): boolean {
    for (const [_, conn] of this.connections.entries()) {
      if (conn.agentId === agentId &&
          (sessionId ? conn.associatedSessions.has(sessionId) : true) &&
          conn.isConnected &&
          conn.ws.readyState === WebSocket.OPEN) {

        conn.ws.send(JSON.stringify(message));
        conn.lastActivity = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Get the WebSocket for a specific agent and session
   */
  getConnectionForSession(agentId: string, sessionId: string): WebSocket | null {
    for (const [_, conn] of this.connections.entries()) {
      if (conn.agentId === agentId &&
          conn.associatedSessions.has(sessionId) &&
          conn.isConnected) {
        return conn.ws;
      }
    }
    return null;
  }

  /**
   * Get all active session IDs for a specific agent
   */
  getActiveSessionIds(agentId: string): string[] {
    const sessionIds: string[] = [];
    for (const [_, conn] of this.connections.entries()) {
      if (conn.agentId === agentId) {
        sessionIds.push(...Array.from(conn.associatedSessions));
      }
    }
    return [...new Set(sessionIds)]; // Remove duplicates
  }

  /**
   * Get the number of connections for an agent
   */
  getConnectionCount(agentId: string): number {
    let count = 0;
    for (const [_, conn] of this.connections.entries()) {
      if (conn.agentId === agentId && conn.isConnected) {
        count++;
      }
    }
    return count;
  }

  /**
   * Close and remove a specific connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      if (connection.ws.readyState === WebSocket.OPEN ||
          connection.ws.readyState === WebSocket.CONNECTING) {
        connection.ws.close();
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Close all connections for a specific agent
   */
  closeAgentConnections(agentId: string): void {
    for (const [connectionId, conn] of this.connections.entries()) {
      if (conn.agentId === agentId) {
        if (conn.ws.readyState === WebSocket.OPEN ||
            conn.ws.readyState === WebSocket.CONNECTING) {
          conn.ws.close();
        }
        this.connections.delete(connectionId);
      }
    }
  }

  /**
   * Close all connections in the pool
   */
  closeAllConnections(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const [_, conn] of this.connections.entries()) {
      if (conn.ws.readyState === WebSocket.OPEN ||
          conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close();
      }
    }
    this.connections.clear();
  }

  /**
   * Clean up stale connections that have been inactive
   */
  private cleanupStaleConnections(): void {
    const now = Date.now();
    for (const [connectionId, conn] of this.connections.entries()) {
      const timeSinceActivity = now - conn.lastActivity.getTime();

      // Check if connection is stale (inactive for too long)
      if (timeSinceActivity > this.connectionTimeout) {
        console.log(`Cleaning up stale connection for agent ${conn.agentId}`);
        this.removeConnection(connectionId);
      }
      // Check if WebSocket is actually closed but we haven't been notified yet
      else if (conn.ws.readyState === WebSocket.CLOSED) {
        this.removeConnection(connectionId);
      }
    }
  }

  /**
   * Check if a connection exists for an agent
   */
  hasActiveConnection(agentId: string): boolean {
    for (const [_, conn] of this.connections.entries()) {
      if (conn.agentId === agentId && conn.isConnected) {
        return true;
      }
    }
    return false;
  }
}

// Create a singleton instance
const wsPoolManager = new WebSocketPoolManager();

export default wsPoolManager;