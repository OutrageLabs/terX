/**
 * Session Manager for terX Multi-Tab Terminal
 *
 * Manages multiple SSH sessions with their associated terminals.
 * Each session has its own Terminal instance, container, and event listeners.
 */

import type { Terminal } from '../../ghostty-web/lib';
import type { FitAddon } from '../../ghostty-web/lib/addons/fit';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { HostWithRelations } from './storage';

// Session status
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Terminal session data
export interface TerminalSession {
  id: string;                        // UUID sesji SSH (z Rust backend)
  hostId: string;                    // ID hosta z storage
  hostName: string;                  // Nazwa hosta (do wyświetlenia w tab)
  hostInfo: HostWithRelations;       // Pełne info o hoście
  terminal: Terminal;                // Instancja ghostty-web Terminal
  fitAddon: FitAddon;                // FitAddon dla tego terminala
  container: HTMLDivElement;         // Kontener DOM dla tego terminala
  unlistenData: UnlistenFn | null;   // Listener na ssh-data-{sessionId}
  unlistenClosed: UnlistenFn | null; // Listener na ssh-closed-{sessionId}
  status: SessionStatus;
  createdAt: Date;
}

// Event types emitted by SessionManager
export type SessionEventType =
  | 'session-created'
  | 'session-closed'
  | 'session-switched'
  | 'session-status-changed'
  | 'all-sessions-closed';

export type SessionEventListener = (
  event: SessionEventType,
  data?: { sessionId?: string; status?: SessionStatus }
) => void;

/**
 * SessionManager - Singleton managing all terminal sessions
 */
class SessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private _activeSessionId: string | null = null;
  private listeners: Set<SessionEventListener> = new Set();

  /**
   * Get active session ID
   */
  get activeSessionId(): string | null {
    return this._activeSessionId;
  }

  /**
   * Get all sessions as array
   */
  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session
   */
  getActiveSession(): TerminalSession | null {
    if (!this._activeSessionId) return null;
    return this.sessions.get(this._activeSessionId) || null;
  }

  /**
   * Find session by host ID
   */
  getSessionByHostId(hostId: string): TerminalSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.hostId === hostId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Check if host already has a session
   */
  hasSessionForHost(hostId: string): boolean {
    return this.getSessionByHostId(hostId) !== undefined;
  }

  /**
   * Get all sessions for a specific host (for multi-connection support)
   */
  getSessionsForHost(hostId: string): TerminalSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.hostId === hostId);
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Add a new session (called after SSH connection established)
   */
  addSession(session: TerminalSession): void {
    this.sessions.set(session.id, session);

    // If this is the first session, make it active
    if (this.sessions.size === 1) {
      this._activeSessionId = session.id;
    }

    this.emit('session-created', { sessionId: session.id });
  }

  /**
   * Remove a session and cleanup resources
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Cleanup listeners
    if (session.unlistenData) {
      session.unlistenData();
    }
    if (session.unlistenClosed) {
      session.unlistenClosed();
    }

    // Dispose terminal and addon
    try {
      session.fitAddon.dispose();
    } catch (e) {
      console.warn('[SessionManager] FitAddon dispose error:', e);
    }

    try {
      session.terminal.dispose();
    } catch (e) {
      console.warn('[SessionManager] Terminal dispose error:', e);
    }

    // Remove container from DOM
    if (session.container.parentNode) {
      session.container.remove();
    }

    // Remove from map
    this.sessions.delete(sessionId);

    // Handle active session change
    if (this._activeSessionId === sessionId) {
      // Switch to another session or null
      const remainingSessions = Array.from(this.sessions.keys());
      const newActiveId = remainingSessions.length > 0 ? remainingSessions[0] : null;

      if (newActiveId) {
        // Use switchSession to properly activate the new session
        this._activeSessionId = null; // Reset first to avoid early return in switchSession
        this.switchSession(newActiveId);
      } else {
        this._activeSessionId = null;
      }
    }

    this.emit('session-closed', { sessionId });

    // Emit all-sessions-closed if no sessions left
    if (this.sessions.size === 0) {
      this.emit('all-sessions-closed');
    }
  }

  /**
   * Switch to a different session
   */
  switchSession(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) {
      console.warn('[SessionManager] Cannot switch to non-existent session:', sessionId);
      return false;
    }

    const newSession = this.sessions.get(sessionId)!;
    const isAlreadyActive = this._activeSessionId === sessionId;
    const hasActiveClass = newSession.container.classList.contains('active');

    // If truly already active (ID matches AND container visible), just focus
    if (isAlreadyActive && hasActiveClass) {
      newSession.terminal.focus();
      return true;
    }

    // Hide current session's container (if different)
    if (!isAlreadyActive) {
      const currentSession = this.getActiveSession();
      if (currentSession) {
        currentSession.container.classList.remove('active');
      }
    }

    // Show new session's container
    newSession.container.classList.add('active');

    // Update active session
    this._activeSessionId = sessionId;

    // Refit terminal to container (may have resized while hidden)
    newSession.fitAddon.fit();

    // Focus terminal
    newSession.terminal.focus();

    this.emit('session-switched', { sessionId });
    return true;
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    this.emit('session-status-changed', { sessionId, status });
  }

  /**
   * Subscribe to session events
   */
  onSessionEvent(listener: SessionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(
    event: SessionEventType,
    data?: { sessionId?: string; status?: SessionStatus }
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        console.error('[SessionManager] Listener error:', e);
      }
    }
  }

  /**
   * Close all sessions (for app shutdown)
   */
  closeAllSessions(): void {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      this.removeSession(id);
    }
  }

  /**
   * Get next session ID (for tab switching with Ctrl+Tab)
   */
  getNextSessionId(): string | null {
    if (this.sessions.size <= 1) return null;

    const ids = Array.from(this.sessions.keys());
    const currentIndex = ids.indexOf(this._activeSessionId || '');
    const nextIndex = (currentIndex + 1) % ids.length;
    return ids[nextIndex];
  }

  /**
   * Get previous session ID (for tab switching with Ctrl+Shift+Tab)
   */
  getPreviousSessionId(): string | null {
    if (this.sessions.size <= 1) return null;

    const ids = Array.from(this.sessions.keys());
    const currentIndex = ids.indexOf(this._activeSessionId || '');
    const prevIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
    return ids[prevIndex];
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
