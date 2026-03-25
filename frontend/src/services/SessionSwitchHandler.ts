/**
 * SessionSwitchHandler - Handles session switching logic and protocol
 * between frontend and backend WebSocket connections.
 */

interface SessionSwitchParams {
  agentId: string;
  sessionId: string;
  previousSessionId?: string;
  token: string;
}

interface SessionSwitchResponse {
  success: boolean;
  newSessionId: string;
  previousSessionId?: string;
  message?: string;
  error?: string;
}

class SessionSwitchHandler {
  /**
   * Handle session switching between WebSocket connections
   */
  async handleSessionSwitch(
    ws: WebSocket,
    newSessionId: string,
    previousSessionId?: string
  ): Promise<SessionSwitchResponse> {
    return new Promise((resolve, reject) => {
      // Check if WebSocket is open
      if (ws.readyState !== WebSocket.OPEN) {
        resolve({
          success: false,
          newSessionId,
          previousSessionId,
          error: 'WebSocket connection is not open'
        });
        return;
      }

      // Prepare session switch message
      const switchMessage = {
        type: 'switch_session',
        session_id: newSessionId
      };

      // Set up response handler
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'session_switched') {
            // Remove listener after receiving response
            ws.removeEventListener('message', handleMessage);

            if (data.success) {
              resolve({
                success: true,
                newSessionId: data.session_id || newSessionId,
                previousSessionId,
                message: data.message || `Successfully switched to session ${newSessionId}`
              });
            } else {
              resolve({
                success: false,
                newSessionId,
                previousSessionId,
                error: data.error || 'Failed to switch session on backend'
              });
            }
          }
        } catch (error) {
          console.error('Error parsing session switch response:', error);
          ws.removeEventListener('message', handleMessage);
          resolve({
            success: false,
            newSessionId,
            previousSessionId,
            error: 'Invalid response format from server'
          });
        }
      };

      // Set up error handler for network issues
      const handleError = () => {
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('error', handleError);
        resolve({
          success: false,
          newSessionId,
          previousSessionId,
          error: 'Network error during session switch'
        });
      };

      // Set up close handler in case connection closes
      const handleClose = () => {
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('error', handleError);
        ws.removeEventListener('close', handleClose);
        resolve({
          success: false,
          newSessionId,
          previousSessionId,
          error: 'Connection closed during session switch'
        });
      };

      // Add event listeners
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('error', handleError);
      ws.addEventListener('close', handleClose);

      // Send session switch message
      try {
        ws.send(JSON.stringify(switchMessage));

        // Set timeout for response
        setTimeout(() => {
          // Remove listeners if no response received
          ws.removeEventListener('message', handleMessage);
          ws.removeEventListener('error', handleError);
          ws.removeEventListener('close', handleClose);

          resolve({
            success: false,
            newSessionId,
            previousSessionId,
            error: 'Timeout waiting for session switch response'
          });
        }, 10000); // 10 second timeout
      } catch (error) {
        // Clean up listeners if send fails
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('error', handleError);
        ws.removeEventListener('close', handleClose);

        resolve({
          success: false,
          newSessionId,
          previousSessionId,
          error: `Failed to send session switch message: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    });
  }

  /**
   * Verify if session switching is supported by the WebSocket connection
   */
  isSessionSwitchSupported(ws: WebSocket): boolean {
    // Check if connection is open and we can send messages
    return ws.readyState === WebSocket.OPEN;
  }

  /**
   * Prepare a session switch by validating inputs
   */
  prepareSessionSwitch(params: SessionSwitchParams): { isValid: boolean; error?: string } {
    if (!params.agentId || typeof params.agentId !== 'string') {
      return {
        isValid: false,
        error: 'Valid agent ID is required'
      };
    }

    if (!params.sessionId || typeof params.sessionId !== 'string') {
      return {
        isValid: false,
        error: 'Valid session ID is required'
      };
    }

    if (!params.token || typeof params.token !== 'string') {
      return {
        isValid: false,
        error: 'Valid authentication token is required'
      };
    }

    return {
      isValid: true
    };
  }

  /**
   * Request current session from WebSocket
   */
  async requestCurrentSession(ws: WebSocket): Promise<{ sessionId: string | null; error?: string }> {
    return new Promise((resolve) => {
      if (ws.readyState !== WebSocket.OPEN) {
        resolve({
          sessionId: null,
          error: 'WebSocket connection is not open'
        });
        return;
      }

      // Send request for current session
      const reqMessage = {
        type: 'get_current_session'
      };

      // Set up response handler
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'current_session') {
            ws.removeEventListener('message', handleMessage);
            resolve({
              sessionId: data.session_id || null
            });
          }
        } catch (error) {
          console.error('Error parsing current session response:', error);
          ws.removeEventListener('message', handleMessage);
          resolve({
            sessionId: null,
            error: 'Invalid response format'
          });
        }
      };

      ws.addEventListener('message', handleMessage);

      // Send request
      try {
        ws.send(JSON.stringify(reqMessage));

        // Set timeout
        setTimeout(() => {
          ws.removeEventListener('message', handleMessage);
          resolve({
            sessionId: null,
            error: 'Timeout waiting for current session response'
          });
        }, 5000);
      } catch (error) {
        ws.removeEventListener('message', handleMessage);
        resolve({
          sessionId: null,
          error: `Failed to send current session request: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    });
  }

  /**
   * Sync session state with backend
   */
  async syncSessionState(
    ws: WebSocket,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    // This is a simplified version - in practice, this might involve more complex state sync
    const response = await this.handleSessionSwitch(ws, sessionId);

    if (response.success) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: response.error
      };
    }
  }
}

// Create a singleton instance
const sessionSwitchHandler = new SessionSwitchHandler();

export default sessionSwitchHandler;