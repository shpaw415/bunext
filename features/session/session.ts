"use client";
import { generateRandomString } from "../utils";
import type { BunextRequest } from "../../internal/server/bunextRequest";
import { getSessionById } from "../../internal/session.ts";
import { createContext, useContext, useEffect, useState } from "react";
import { RequestContext } from "../../internal/server/context";
export { GetSession } from "../request/bunextRequest";
import { SessionNotInitedWarning } from "../../internal/server/logs.ts";

/**
 * Session data structure with improved type safety
 */
export interface SessionData<T = unknown> {
  public: Record<string, T>;
  private: Record<string, T> & {
    __BUNEXT_SESSION_CREATED_AT__?: number;
    __BUNEXT_SESSION_LAST_ACCESSED__?: number;
    __BUNEXT_SESSION_ID__?: string;
  };
}

/**
 * Session configuration options
 */
export interface SessionOptions<T = any> {
  data?: SessionData<T>;
  sessionTimeout?: number;
  request?: BunextRequest;
  updateFunction?: React.Dispatch<React.SetStateAction<boolean>>;
  autoCleanup?: boolean;
  enableLogging?: boolean;
  preventSessionInit?: boolean;
}

/**
 * Session errors
 */
export class SessionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class ClientSideSessionError extends SessionError {
  constructor(operation: string) {
    super(`${operation} cannot be called in a client context`, "CLIENT_SIDE_ERROR");
  }
}

export class SessionNotInitializedError extends SessionError {
  constructor() {
    super("Session not initialized - call initData() first", "NOT_INITIALIZED");
  }
}

/**
 * Environment and utility functions
 */
const isClientSide = (): boolean => typeof window !== "undefined";
const isServerSide = (): boolean => typeof window === "undefined";

/**
 * Global type declarations with better typing
 */
declare global {
  var __SESSION_TIMEOUT__: number;
  var __BUNEXT_SESSION__: BunextSession<unknown>;
}

/**
 * Public session interface for app usage
 */
export type InAppSession<DataType = any> = Omit<
  BunextSession<DataType>,
  | "_internalData"
  | "_isDeleted"
  | "_isUpdated"
  | "_request"
  | "_updateFunction"
  | "_sessionId"
  | "_serverSessionInitialized"
  | "_preventSessionInit"
  | "initData"
  | "setSessionTimeout"
  | "_setPublicData"
  | "_setPrivateData"
  | "_log"
  | "_ensureServerSide"
  | "_ensureRequestAvailable"
  | "_ensureInitialized"
  | "_isExpired"
  | "_sessionExists"
  | "_updateLastAccessed"
  | "_clearData"
  | "_clearClientData"
  | "_triggerUpdate"
>;

/**
 * Enhanced session management class with improved type safety and error handling
 */
export class BunextSession<DataType = any> {
  // Internal state with better naming
  protected _internalData: SessionData<DataType> = {
    public: {} as Record<string, DataType>,
    private: {} as Record<string, DataType> & {
      __BUNEXT_SESSION_CREATED_AT__?: number;
      __BUNEXT_SESSION_LAST_ACCESSED__?: number;
      __BUNEXT_SESSION_ID__?: string;
    },
  };

  protected _isDeleted = false;
  protected _isUpdated = false;
  protected _sessionTimeout = 3600; // 1 hour default
  private _request?: BunextRequest;
  private _updateFunction?: React.Dispatch<React.SetStateAction<boolean>>;
  private _sessionId = generateRandomString(12);
  protected _sessionExpirationOverride?: number;
  private _serverSessionInitialized = false;
  private _enableLogging = false;

  constructor(options: SessionOptions<DataType> = {}) {
    const {
      data,
      sessionTimeout = 3600,
      request,
      updateFunction,
      enableLogging = false,
    } = options;

    if (data) this._internalData = data;
    this._sessionTimeout = sessionTimeout;
    this._request = request;
    this._updateFunction = updateFunction;
    this._enableLogging = enableLogging;

    // Auto-initialize in build mode or when session init is disabled
    if (
      process.env.__BUILD_MODE__ ||
      process.env.__SESSION_MUST_NOT_BE_INITED__ === "true"
    ) {
      this._serverSessionInitialized = true;
    }
  }

  /**
   * Set session data (enhanced to support both server and client-side updates)
   * On client-side, updates global session data for server action callbacks
   */
  setData(data: Partial<DataType>, isPublic = false): void {
    if (!data || typeof data !== "object") {
      throw new SessionError("Invalid session data provided", "INVALID_DATA");
    }

    // Client-side handling for server action callbacks and global state updates
    if (isClientSide()) {
      if (isPublic) {
        // Update internal public data
        this._setPublicData(data);

        // Update global state for server action callbacks
        globalThis.__PUBLIC_SESSION_DATA__ = {
          ...globalThis.__PUBLIC_SESSION_DATA__,
          ...data,
        };

        // Trigger component updates
        this._triggerUpdate();
      } else {
        // For non-public data on client, just update internal state
        this._internalData.public = {
          ...this._internalData.public,
          ...data,
        } as Record<string, DataType>;

        this._triggerUpdate();
      }

      this._isUpdated = true;
      return;
    }

    // Server-side handling (existing logic)
    this._ensureServerSide("setData");
    this._ensureRequestAvailable();
    this._ensureInitialized();

    this._isUpdated = true;

    if (isPublic) {
      this._setPrivateData(data);
      this._setPublicData(data);
    } else {
      this._setPrivateData(data);
    }
  }

  /**
   * Convenience method for session providers to set public session data
   * This method is specifically designed for session providers and components
   * that need to update public session data from client-side
   */
  setPublicData(data: Partial<DataType>): void {
    if (!data || typeof data !== "object") {
      this._log("Invalid data provided to setPublicData", { data }, "warn");
      return;
    }

    // Use setData with isPublic=true to ensure proper handling
    this.setData(data, true);
  }

  /**
   * Get current public session data (client-side safe)
   */
  getPublicData(): Record<string, any> {
    if (isClientSide()) {
      return globalThis.__PUBLIC_SESSION_DATA__ || this._internalData.public || {};
    }
    return this._internalData.public || {};
  }

  /**
   * Check if global session data is available (client-side)
   */
  hasGlobalSessionData(): boolean {
    return isClientSide() &&
      typeof globalThis.__PUBLIC_SESSION_DATA__ === 'object' &&
      globalThis.__PUBLIC_SESSION_DATA__ !== null &&
      Object.keys(globalThis.__PUBLIC_SESSION_DATA__).length > 0;
  }

  /**
   * Initialize global session data (for session provider)
   * This method sets up the global state for client-side session management
   */
  initializeGlobalSessionData(initialData?: Partial<DataType>): void {
    if (isServerSide()) {
      this._log("initializeGlobalSessionData called on server-side, ignoring", undefined, "warn");
      return;
    }

    // Initialize global session data if not already present
    if (!globalThis.__PUBLIC_SESSION_DATA__) {
      globalThis.__PUBLIC_SESSION_DATA__ = {};
    }

    // If we have a global session timeout but no session creation time, 
    // we need to estimate the creation time based on the timeout
    if (globalThis.__SESSION_TIMEOUT__ && !this._internalData.private.__BUNEXT_SESSION_CREATED_AT__) {
      // globalThis.__SESSION_TIMEOUT__ is typically the expiration timestamp
      // We need to calculate when the session was likely created
      const sessionDurationSeconds = this._sessionTimeout; // Default session duration
      const estimatedCreationTime = globalThis.__SESSION_TIMEOUT__ - (sessionDurationSeconds * 1000);


      this._internalData.private.__BUNEXT_SESSION_CREATED_AT__ = Math.max(estimatedCreationTime, Date.now() - (sessionDurationSeconds * 1000));
      this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__ = Date.now();
      this._internalData.private.__BUNEXT_SESSION_ID__ = this._sessionId;
    }

    // Set initial data if provided
    if (initialData && typeof initialData === "object") {
      this.setData(initialData, true);
    } else {
      // Sync existing internal data with global state
      if (Object.keys(this._internalData.public).length > 0) {
        globalThis.__PUBLIC_SESSION_DATA__ = {
          ...globalThis.__PUBLIC_SESSION_DATA__,
          ...this._internalData.public,
        };
      }
    }

    // Set session timeout in global state if not present
    if (!globalThis.__SESSION_TIMEOUT__) {
      globalThis.__SESSION_TIMEOUT__ = Date.now() + (this.getExpiration() * 1000);
    }
  }

  /**
   * Synchronize session with global timeout (client-side)
   * This method ensures session metadata is consistent with global timeout
   */
  synchronizeWithGlobalTimeout(): void {
    if (isServerSide() || !globalThis.__SESSION_TIMEOUT__) {
      return;
    }

    const globalTimeout = globalThis.__SESSION_TIMEOUT__;
    const currentTime = Date.now();

    // If we don't have creation time but we have global timeout, estimate it
    if (!this._internalData.private.__BUNEXT_SESSION_CREATED_AT__ && globalTimeout > currentTime) {
      const sessionDurationSeconds = this._sessionTimeout;
      const estimatedCreationTime = globalTimeout - (sessionDurationSeconds * 1000);

      this._internalData.private.__BUNEXT_SESSION_CREATED_AT__ = Math.max(
        estimatedCreationTime,
        currentTime - (sessionDurationSeconds * 1000)
      );
      this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__ = currentTime;
      this._internalData.private.__BUNEXT_SESSION_ID__ = this._sessionId;
    }
  }

  /**
   * Update session data from server action response (client-side only)
   * This method is specifically designed for server action callbacks
   */
  updateFromServerAction(data: Partial<DataType>, options: {
    updateTimeout?: number;
    triggerRerender?: boolean;
  } = {}): void {
    if (isServerSide()) {
      this._log("updateFromServerAction called on server-side, ignoring", undefined, "warn");
      return;
    }

    if (!data || typeof data !== "object") {
      this._log("Invalid data provided to updateFromServerAction", { data }, "warn");
      return;
    }

    const { updateTimeout, triggerRerender = true } = options;

    // Update internal public data
    this._internalData.public = {
      ...this._internalData.public,
      ...data,
    } as Record<string, DataType>;

    // Update global state
    globalThis.__PUBLIC_SESSION_DATA__ = {
      ...globalThis.__PUBLIC_SESSION_DATA__,
      ...data,
    };

    // Update session timeout if provided
    if (updateTimeout && typeof updateTimeout === 'number' && updateTimeout > 0) {
      globalThis.__SESSION_TIMEOUT__ = updateTimeout;
    }

    // Mark as updated
    this._isUpdated = true;

    // Trigger component re-render if requested
    if (triggerRerender) {
      this._triggerUpdate();
    }
  }

  /**
   * Get session data (works on both server and client)
   */
  getData(getPublic = false): DataType | undefined {
    try {
      // Server-side handling
      if (this._request && !this._serverSessionInitialized) {
        this._log("Session not initialized on server", undefined, "warn");
        return undefined;
      }

      // Client-side handling
      if (isClientSide()) {
        if (this._isExpired()) {
          return undefined;
        }
        return this._internalData.public as DataType | undefined;
      }

      // Server-side data retrieval
      if (!this._sessionExists()) {
        return undefined;
      }

      if (this._isExpired()) {
        this.delete();
        return undefined;
      }

      this._updateLastAccessed();

      return getPublic
        ? (this._internalData.public as DataType | undefined)
        : (this._internalData.private as DataType | undefined);
    } catch (error) {
      this._log(`Error getting session data: ${error}`, undefined, "error");
      return undefined;
    }
  }

  /**
   * Delete session (works on both server and client)
   */
  async delete(): Promise<void> {
    try {
      if (isClientSide()) {
        const response = await fetch("/bunextDeleteSession", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new SessionError("Failed to delete session on server", "DELETE_FAILED");
        }

        this._clearClientData();
        this._triggerUpdate();
      } else {
        this._ensureInitialized();
        this._isDeleted = true;
        this._clearData();
      }
    } catch (error) {
      this._log(`Error deleting session: ${error}`, undefined, "error");
      throw error instanceof SessionError
        ? error
        : new SessionError(`Delete failed: ${error}`, "DELETE_FAILED");
    }
  }

  /**
   * Reset session data (server-side only)
   */
  reset(): this {
    this._ensureServerSide("reset");
    this._clearData();
    return this;
  }

  /**
   * Set custom session expiration
   */
  setExpiration(expirationSeconds: number): this {
    if (expirationSeconds <= 0) {
      throw new SessionError("Expiration must be positive", "INVALID_EXPIRATION");
    }
    this._sessionExpirationOverride = expirationSeconds;
    return this;
  }

  /**
   * Get session expiration
   */
  getExpiration(): number {
    return globalThis.__SESSION_TIMEOUT__ || this._sessionTimeout;
  }

  /**
   * Initialize session data (server-side only)
   */
  async initData(): Promise<void> {
    if (!this._request) {
      this._log("No request available for session initialization", undefined, "warn");
      return;
    }

    try {
      const sessionType = globalThis.serverConfig?.session?.type;

      switch (sessionType) {
        case "cookie":
          const sessionData = this._request.webtoken.session();
          if (sessionData) {
            this._internalData = sessionData;
          }
          break;

        case "database:memory":
        case "database:hard":
          const sessionId = this._request.SessionID;
          if (sessionId) {
            const retrievedData = await getSessionById(sessionId);
            if (retrievedData) {
              this._internalData = retrievedData;
            }
          }
          break;

        default:
          this._log(`Unknown session type: ${sessionType}`, undefined, "warn");
      }

      this._serverSessionInitialized = true;
    } catch (error) {
      this._log(`Failed to initialize session: ${error}`, undefined, "error");
      throw new SessionError(
        `Session initialization failed: ${error}`,
        "INIT_FAILED"
      );
    }
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return this._isExpired();
  }

  /**
   * Check if session exists
   */
  exists(): boolean {
    return this._sessionExists();
  }

  /**
   * Get session metadata
   */
  getMetadata(): {
    id: string;
    created: number | undefined;
    lastAccessed: number | undefined;
    isExpired: boolean;
    isInitialized: boolean;
  } {
    return {
      id: this._sessionId,
      created: this._internalData.private.__BUNEXT_SESSION_CREATED_AT__,
      lastAccessed: this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__,
      isExpired: this._isExpired(),
      isInitialized: this._serverSessionInitialized,
    };
  }

  /**
   * Check if session has been updated
   */
  isSessionUpdated(): boolean {
    return this._isUpdated;
  }

  /**
   * Check if session is marked for deletion
   */
  isSessionDeleted(): boolean {
    return this._isDeleted;
  }

  /**
   * Get session data (modern API)
   */
  getSessionData(getPublic = false): any {
    return this.getData(getPublic);
  }
  /**
   * Get raw session data (for internal use)
   */
  getRawSessionData(): SessionData<DataType> {
    return this._internalData;
  }

  /**
   * Get public session data
   */
  getPublicSessionData(): any {
    return this._internalData.public;
  }

  /**
   * Get session expiration override
   */
  get session_expiration_override(): number | undefined {
    return this._sessionExpirationOverride;
  }

  /**
   * Set session expiration override
   */
  set session_expiration_override(value: number | undefined) {
    this._sessionExpirationOverride = value;
  }

  /**
   * Get remaining session time from now
   */
  get sessionTimeoutFromNow(): number {
    const timeout = this._sessionExpirationOverride || this._sessionTimeout;
    const createdAt = this._internalData.private.__BUNEXT_SESSION_CREATED_AT__;
    if (!createdAt) return timeout;

    const elapsed = (Date.now() - createdAt) / 1000;
    return Math.max(0, timeout - elapsed);
  }

  // Legacy compatibility (deprecated)
  get __DATA__() {
    //console.warn("__DATA__ is deprecated, use getData() instead");
    return this._internalData;
  }

  get __DELETE__() {
    console.warn("__DELETE__ is deprecated, use internal methods instead");
    return this._isDeleted;
  }

  get isUpdated() {
    console.warn("isUpdated is deprecated, use internal state instead");
    return this._isUpdated;
  }

  /**
   * Private helper methods
   */
  private _log(message: string, data?: any, level: "info" | "warn" | "error" = "info"): void {
    // Only log if development environment variables are set
    const shouldLog = isClientSide()
      ? process.env.PUBLIC_BUNEXT_DEV === "true"
      : process.env.__BUNEXT_DEV__ === "true";

    if (!shouldLog && !this._enableLogging) return;

    // Only log errors by default, info/warn only in dev mode
    if (!shouldLog && level !== "error") return;

    const logMessage = `[Session ${this._sessionId}] ${message}`;

    switch (level) {
      case "warn":
        console.warn(logMessage, data);
        break;
      case "error":
        console.error(logMessage, data);
        break;
      default:
        console.log(logMessage, data);
    }
  }

  private _ensureServerSide(operation: string): void {
    if (isClientSide()) {
      throw new ClientSideSessionError(operation);
    }
  }

  private _ensureRequestAvailable(): void {
    if (!this._request) {
      throw new SessionError("No request found for session operation", "NO_REQUEST");
    }
  }

  private _ensureInitialized(): void {
    if (!this._serverSessionInitialized) {
      console.log(SessionNotInitedWarning);
      throw new SessionNotInitializedError();
    }
  }

  private _isExpired(): boolean {
    if (isClientSide()) {
      const timeout = globalThis.__SESSION_TIMEOUT__;
      return timeout ? (timeout - Date.now() <= 0) : false;
    }

    const createdAt = this._internalData.private.__BUNEXT_SESSION_CREATED_AT__;
    if (!createdAt) return true;

    const timeout = this._sessionExpirationOverride || this._sessionTimeout;
    return Date.now() > createdAt + timeout * 1000;
  }

  private _sessionExists(): boolean {
    return typeof this._internalData.private.__BUNEXT_SESSION_CREATED_AT__ !== "undefined";
  }

  private _updateLastAccessed(): void {
    this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__ = Date.now();
  }

  private _clearData(): void {
    this._internalData = {
      public: {} as Record<string, DataType>,
      private: {} as Record<string, DataType> & {
        __BUNEXT_SESSION_CREATED_AT__?: number;
        __BUNEXT_SESSION_LAST_ACCESSED__?: number;
        __BUNEXT_SESSION_ID__?: string;
      },
    };
  }

  private _clearClientData(): void {
    this._internalData.public = {} as Record<string, DataType>;
    globalThis.__PUBLIC_SESSION_DATA__ = {};
  }

  private _triggerUpdate(): void {
    this._internalData.public = (globalThis.__PUBLIC_SESSION_DATA__ as Record<string, DataType>) || {};
    this._updateFunction?.((prev) => !prev);
  }

  public _setPublicData(data: Partial<DataType>): void {
    // Update internal public data
    this._internalData.public = {
      ...this._internalData.public,
      ...data,
      __SESSION_TIMEOUT__: this.getExpiration(),
    } as Record<string, DataType>;

    // On client-side, also update global state for consistency
    if (isClientSide()) {
      globalThis.__PUBLIC_SESSION_DATA__ = {
        ...globalThis.__PUBLIC_SESSION_DATA__,
        ...this._internalData.public,
      };
    }
  }

  private _setPrivateData(data: Partial<DataType>): void {
    const now = Date.now();
    this._internalData.private = {
      ...this._internalData.private,
      __BUNEXT_SESSION_CREATED_AT__: this._internalData.private.__BUNEXT_SESSION_CREATED_AT__ || now,
      __BUNEXT_SESSION_LAST_ACCESSED__: now,
      __BUNEXT_SESSION_ID__: this._sessionId,
      ...data,
    } as Record<string, DataType> & {
      __BUNEXT_SESSION_CREATED_AT__?: number;
      __BUNEXT_SESSION_LAST_ACCESSED__?: number;
      __BUNEXT_SESSION_ID__?: string;
    };
    this._isUpdated = true;
  }

  // Legacy methods for backward compatibility
  update(): void {
    this._triggerUpdate();
  }

  prevent_session_init(): void {
    //console.warn("prevent_session_init() is deprecated, use constructor options instead");
    this._serverSessionInitialized = true;
  }

  setSessionTimeout(value: number): void {
    console.warn("setSessionTimeout() is deprecated, use setExpiration() instead");
    globalThis.__SESSION_TIMEOUT__ = value;
  }
}

/**
 * Legacy Session class for backward compatibility
 * @deprecated Use BunextSession instead
 */
export class _Session<DataType = any> extends BunextSession<DataType> {
  constructor(options: any = {}) {
    //console.warn("_Session is deprecated, use BunextSession instead");
    super({
      data: options.data,
      sessionTimeout: options.sessionTimeout,
      request: options.request,
      updateFunction: options.update_function,
    });
  }

  // Legacy properties for backward compatibility
  get session_expiration_override(): number | undefined {
    return this._sessionExpirationOverride;
  }

  set session_expiration_override(value: number | undefined) {
    this._sessionExpirationOverride = value;
  }

  get sessionTimeoutFromNow(): number {
    const timeout = this._sessionExpirationOverride || this._sessionTimeout;
    const createdAt = this._internalData.private.__BUNEXT_SESSION_CREATED_AT__;
    if (!createdAt) return timeout;

    const elapsed = (Date.now() - createdAt) / 1000;
    return Math.max(0, timeout - elapsed);
  }

  // New methods to replace deprecated ones
  isSessionUpdated(): boolean {
    return this._isUpdated;
  }

  isSessionDeleted(): boolean {
    return this._isDeleted;
  }

  getSessionData(getPublic = false): any {
    return this.getData(getPublic);
  }

  getPublicSessionData(): any {
    return this._internalData.public;
  }
}

export const SessionContext = createContext<_Session<any>>(new _Session({}));
export const SessionDidUpdateContext = createContext(false);

/**
 * return the session object
 */
export function useSession<DataType>() {
  const server_session = useContext(RequestContext);
  const session = useContext(SessionContext);
  const did_update = useContext(SessionDidUpdateContext);
  const [, setState] = useState(false);

  useEffect(() => setState(did_update), [did_update]);

  return (
    (server_session?.session as InAppSession<DataType>) ??
    (session as InAppSession<DataType>)
  );
}
