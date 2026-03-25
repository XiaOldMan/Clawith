/**
 * SessionStateManager - Manages session states across WebSocket connections
 * to track active/inactive sessions and manage their lifecycle.
 */

interface SessionState {
  id: string;
  isActive: boolean;
  unreadCount: number;
  lastActivity: Date;
  messages: Array<any>; // Store messages for the session
  isDisconnected: boolean;
  error?: string;
}

class SessionStateManager {
  private sessions: Map<string, SessionState> = new Map();

  /**
   * Initialize a session
   */
  initializeSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        isActive: false,
        unreadCount: 0,
        lastActivity: new Date(),
        messages: [],
        isDisconnected: false
      });
    }
  }

  /**
   * Activate a session
   */
  activateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = true;
      session.unreadCount = 0; // Reset unread count when activated
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Deactivate a session
   */
  deactivateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Mark a session as disconnected
   */
  markDisconnected(sessionId: string, errorMessage?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isDisconnected = true;
      session.error = errorMessage;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Mark a session as reconnected
   */
  markReconnected(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isDisconnected = false;
      session.error = undefined;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: any): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastActivity = new Date();

      // If session is not active, increment unread count
      if (!session.isActive) {
        session.unreadCount++;
      }

      return true;
    }
    return false;
  }

  /**
   * Add multiple messages to a session
   */
  addMessages(sessionId: string, messages: any[]): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(...messages);
      session.lastActivity = new Date();

      // If session is not active, increment unread count
      if (!session.isActive) {
        session.unreadCount += messages.length;
      }

      return true;
    }
    return false;
  }

  /**
   * Clear messages for a session
   */
  clearMessages(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      return true;
    }
    return false;
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Get inactive sessions
   */
  getInactiveSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(session => !session.isActive);
  }

  /**
   * Get sessions with unread messages
   */
  getUnreadSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(session => session.unreadCount > 0);
  }

  /**
   * Get total unread count
   */
  getTotalUnreadCount(): number {
    return Array.from(this.sessions.values()).reduce(
      (total, session) => total + session.unreadCount, 0
    );
  }

  /**
   * Get session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Update session error
   */
  updateSessionError(sessionId: string, error: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.error = error;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Clear session error
   */
  clearSessionError(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.error = undefined;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }
}

// Create a singleton instance
const sessionStateManager = new SessionStateManager();

export default sessionStateManager;