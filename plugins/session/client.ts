"use client";
import { generateRandomString } from "public/utils";
import { createContext, useContext, useEffect, useState } from "react";
import { RequestContext } from "internal/server/context";
import type { SessionPluginContext } from ".";
import { SessionAPIEndPoints } from "./endPoints";
import type { InitializedPrivateSessionData, SessionData } from "./common";


export const NewSessionHeaderName = "__BUNEXT_NEW_SESSION__";
/**
 * Header name for session timeout in seconds
 */
export const SessionTimeoutheaderName = "__bunext_session_timeout__";



/**
 * Session configuration options
 */
export type SessionOptions<T extends Record<string, unknown> = {}> = {
  data?: SessionData<T, true>;
  /**
   * Session timeout in seconds (default: 3600 seconds = 1 hour)
   */
  sessionTimeout?: number;
  updateFunction?: React.Dispatch<React.SetStateAction<boolean>>;
  autoCleanup?: boolean;
  enableLogging?: boolean;
  preventSessionInit?: boolean;
  exists?: boolean;
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
    super("Session not initialized - call await bunextReq.getContext().__INIT_SESSION__() to initialize it first", "NOT_INITIALIZED");
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
  var __BUNEXT_SESSION__: BunextSession<{}>;
}

/**
 * Public session interface for app usage
 */
export type InAppSession<DataType extends Record<string, unknown>> = Omit<
  BunextSession<DataType>,
  | "_internalData"
  | "_isDeleted"
  | "_isUpdated"
  | "_updateFunction"
  | "_sessionId"
  | "_serverSessionInitialized"
  | "_preventSessionInit"
  | "initData"
  | "setSessionTimeout"
  | "_log"
  | "_ensureServerSide"
  | "_ensureRequestAvailable"
  | "_ensureInitialized"
  | "_isExpired"
  | "_sessionExists"
  | "_updateLastAccessed"
  | "_triggerUpdate"
  | "_setData"
  | "init"
>;

/**
 * Enhanced session management class with improved type safety and error handling
 */
export class BunextSession<DataType extends Record<string, unknown> = {}> {
  // Internal state with better naming
  private _internalData: SessionData<DataType, true> = {
    public: {} as DataType,
    private: {} as SessionData<DataType, true>["private"],
  };

  private _isDeleted = false;
  private _isUpdated = false;

  private _updateFunction?: React.Dispatch<React.SetStateAction<boolean>>;
  private _sessionId: string = generateRandomString(32);
  private _serverSessionInitialized = false;
  private _enableLogging = false;
  private _exists: boolean;
  private _initalTimeout: number;
  private _sessionPreventedInit = false;


  constructor(options: SessionOptions<DataType> = {}) {
    const {
      data,
      sessionTimeout = 3600,
      updateFunction,
      enableLogging = false,
      exists = false
    } = options;

    if (data) this._internalData = data;
    this._initalTimeout = this.createSessionExpirationFromSeconds(sessionTimeout);
    this._updateFunction = updateFunction;
    this._enableLogging = enableLogging;
    this._exists = exists;
  }
  init(data: SessionData<DataType, true> | null): this {
    if (this._serverSessionInitialized || this._sessionPreventedInit) return this;

    this._exists = Boolean(data);

    const _data = this.initSessionMetaData(data);
    this._internalData = _data;
    this._serverSessionInitialized = true;

    if (this.isExpired()) this.reset();

    return this;
  }

  public _get_private_meta_data(): InitializedPrivateSessionData {
    return {
      __BUNEXT_SESSION_CREATED_AT__: this._internalData.private.__BUNEXT_SESSION_CREATED_AT__,
      __BUNEXT_SESSION_LAST_ACCESSED__: this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__,
      __BUNEXT_SESSION_EXPIRATION__: this._internalData.private.__BUNEXT_SESSION_EXPIRATION__,
      __BUNEXT_SESSION_ID__: this._internalData.private.__BUNEXT_SESSION_ID__,
      __BUNEXT_RANDOM_ID__: this._internalData.private.__BUNEXT_RANDOM_ID__,
    };
  }

  private initSessionMetaData(data: SessionData<DataType, true | false> | null): SessionData<DataType, true> {
    if (!data) {
      return {
        public: {},
        private: {
          __BUNEXT_SESSION_CREATED_AT__: Date.now(),
          __BUNEXT_SESSION_LAST_ACCESSED__: Date.now(),
          __BUNEXT_SESSION_ID__: this._sessionId,
          __BUNEXT_SESSION_EXPIRATION__: this._initalTimeout,
          __BUNEXT_RANDOM_ID__: generateRandomString(16),
        },
      } as SessionData<DataType, true>;
    } else {
      const privateData = data.private as Partial<SessionData<DataType, true>["private"]> || {};
      return {
        public: data.public,
        private: {
          ...data.private,
          __BUNEXT_SESSION_ID__: privateData?.__BUNEXT_SESSION_ID__ || this._sessionId,
          __BUNEXT_SESSION_CREATED_AT__: privateData?.__BUNEXT_SESSION_CREATED_AT__ || Date.now(),
          __BUNEXT_SESSION_LAST_ACCESSED__: privateData?.__BUNEXT_SESSION_LAST_ACCESSED__ || Date.now(),
          __BUNEXT_SESSION_EXPIRATION__: privateData?.__BUNEXT_SESSION_EXPIRATION__ || this._initalTimeout,
          __BUNEXT_RANDOM_ID__: generateRandomString(16),
        }
      } as SessionData<DataType, true>;
    }

  }

  get _rawData() {
    return this._internalData as SessionData<DataType, true>;
  }

  getSessionId(): string {
    this._ensureInitialized();
    return this._sessionId;
  }
  /**
   * @returns boolean - whether the session exists or not
   */
  exists() {
    return this._exists;
  }
  _setExists(value: boolean) {
    this._exists = value;
  }
  isInitialized(): boolean {
    return this._serverSessionInitialized;
  }
  /**
   * Sets session data from a response object.
   * 
   * Exemple: From a API call
   * 
   * @param response The response object to extract session data from.
   * @returns A promise that resolves when the data has been set.
   */
  async setDataFromResponse(response: Response) {
    if (!response.ok) {
      throw new SessionError("Failed to set data from response", "RESPONSE_ERROR");
    }
    const data = GetSessionFromResponse(response);
    if (!data) return;

    this._setData({
      public: data.session as DataType,
      private: this._internalData.private || {},
    });
    if (!data.timeout) return;
    this._updateTimeout(data.timeout);
  }
  private _updateTimeout(newTimeout: number) {
    this._ensureInitialized();
    this._internalData.private.__BUNEXT_SESSION_EXPIRATION__ = newTimeout;
  }
  /**
   * Sets session data (internal use only)
   * 
   * @param data 
   * @param isPublic 
   */
  public _setData(data: SessionData<DataType>): void {
    this._ensureDataFormat(data.public);
    this._ensureDataFormat(data.private);
    this.setPublicData(data.public);
    this.setPrivateData(data.private);
    if (isClientSide()) this._triggerUpdate();
  }
  /**
   * Set session data (enhanced to support both server and client-side updates)
   * On client-side, updates global session data for server action callbacks
   */
  setData(data: Partial<DataType>, isPublic: boolean = false): void {


    this._ensureServerSide("setData");
    this._ensureInitialized();

    this._isUpdated = true;

    if (isPublic) {
      this.setPrivateData(data);
      this.setPublicData(data);
    } else {
      this.setPrivateData(data);
    }
  }

  setPrivateData(data: Partial<DataType>): void {
    this._ensureServerSide("setPrivateData");
    this._ensureInitialized();
    this._ensureDataFormat(data);

    this._internalData.private = {
      ...this._internalData.private,
      ...data,
    };
    this._isUpdated = true;
  }

  setPublicData(data: Partial<DataType>): void {
    this._ensureServerSide("setPublicData");
    this._ensureInitialized();

    if (!data || typeof data !== "object") {
      throw new SessionError("Invalid public data provided", "INVALID_DATA");
    }

    this._internalData.public = {
      ...this._internalData.public,
      ...data,
    } as DataType;

    this._isUpdated = true;
  }

  /**
   * Get current public session data (client-side safe)
   */
  getPublicData(): DataType | null {
    return this._internalData.public || null;
  }
  getPrivateData() {
    this._ensureServerSide("getPrivateData");
    this._ensureInitialized();
    return this._internalData.private || null;
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
    this._internalData.public = data as DataType;

    // Update session timeout if provided
    if (updateTimeout && typeof updateTimeout === 'number' && updateTimeout > 0) {
      this._updateTimeout(updateTimeout);
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
  getData<DataAwaited extends keyof SessionData<DataType, true> = "public">(): SessionData<DataType, true>[DataAwaited] | undefined {
    if (isServerSide()) this._ensureInitialized();

    if (!this.exists()) return undefined;
    try {
      // Server-side handling
      if (!this._serverSessionInitialized) {
        return undefined;
      }

      // Client-side handling
      if (isClientSide()) {
        if (this._isExpired() || !this.exists()) {
          return undefined;
        }
        return this._internalData.public as SessionData<DataType, true>[DataAwaited];
      }

      // Server-side data retrieval
      if (!this.exists()) {
        return undefined;
      }

      if (this._isExpired()) {
        this.delete();
        return undefined;
      }

      this._updateLastAccessed();

      return ({ ...this._internalData.public, ...this._internalData.private } as DataType | undefined) as SessionData<DataType, true>[DataAwaited];
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
        const response = await fetch(SessionAPIEndPoints.delete, {
          method: "DELETE"
        });

        if (!response.ok) {
          throw new SessionError("Failed to delete session on server", "DELETE_FAILED");
        }

        this._clearClientData();
        this._triggerUpdate();
      } else {
        this._ensureInitialized();
        this._isDeleted = true;
        this.reset();
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
    this._ensureInitialized();
    this._internalData = this.initSessionMetaData({
      public: {},
      private: {},
    });
    this._isUpdated = true;
    return this;
  }

  /**
   * Get session expiration
   */
  getExpiration(): number {
    this._ensureInitialized();
    return this._internalData.private.__BUNEXT_SESSION_EXPIRATION__;
  }
  /**
   * 
   * @param seconds Set session expiration in seconds (server-side only)
   */
  setExpiration(seconds: number): void {
    this._ensureInitialized();
    if (typeof seconds !== "number" || seconds <= 0) {
      throw new SessionError("Invalid expiration time", "INVALID_EXPIRATION");
    }
    this._internalData.private.__BUNEXT_SESSION_EXPIRATION__ = this.createSessionExpirationFromSeconds(seconds);
    if (isServerSide()) this._isUpdated = true;
  }
  private createSessionExpirationFromSeconds(seconds: number): number {
    return Date.now() + seconds * 1000;
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return this._isExpired();
  }

  /**
   * Get session metadata
   */
  getMetadata(): {
    id?: string;
    created: number | undefined;
    lastAccessed: number | undefined;
    isExpired: boolean;
    isInitialized: boolean;
  } {

    const internalData = this._internalData as SessionData<DataType, true>;

    return {
      id: this._sessionId,
      created: internalData.private?.__BUNEXT_SESSION_CREATED_AT__,
      lastAccessed: internalData.private?.__BUNEXT_SESSION_LAST_ACCESSED__,
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

  private _isExpired(): boolean {
    return Date.now() > this._internalData.private.__BUNEXT_SESSION_EXPIRATION__;
  }

  private _updateLastAccessed(): void {
    this._internalData.private.__BUNEXT_SESSION_LAST_ACCESSED__ = Date.now();
  }

  private _ensureServerSide(method: string): void {
    if (isClientSide()) {
      throw new ClientSideSessionError(method);
    }
  }
  private _ensureInitialized(): void {
    if (process.env.NODE_ENV == "development" && isServerSide()) return;
    if (!this._serverSessionInitialized) {
      this._log("Session not initialized", undefined, "warn");
      throw new SessionNotInitializedError();
    }
  }
  private _clearClientData(): void {
    this._internalData.public = {} as DataType;
    globalThis.__PUBLIC_SESSION_DATA__ = {};
  }

  private _triggerUpdate(): void {
    if (!isClientSide()) return;
    this._updateFunction?.((prev) => !prev);
  }
  private _ensureDataFormat(data: Partial<DataType> | SessionData<DataType>): boolean {
    if (!data || typeof data !== "object") {
      throw new SessionError("Invalid session data provided", "INVALID_DATA");
    }
    return true;
  }



  // Legacy methods for backward compatibility
  update(): void {
    this._triggerUpdate();
  }

  prevent_session_init(): void {
    this._sessionPreventedInit = true;
    this.reset();
  }
}



export const SessionContext = createContext<BunextSession<any>>(new BunextSession({}));
export const SessionDidUpdateContext = createContext(false);

/**
 * return the session object in a client context
 */
export function useSession<DataType extends Record<string, unknown>>() {
  const server_session = useContext(RequestContext);
  const session = useContext(SessionContext);
  const did_update = useContext(SessionDidUpdateContext);
  const [, setState] = useState(false);

  useEffect(() => setState(did_update), [did_update]);

  return (
    (server_session?.getContext<SessionPluginContext>().session as unknown as InAppSession<DataType>) ??
    (session as InAppSession<DataType>)
  );
}


export function GetSessionFromResponse(response: Response) {
  const sessionHeader = response.headers.get(NewSessionHeaderName);
  const timeoutHeader = response.headers.get(SessionTimeoutheaderName);
  if (!sessionHeader) return null;

  return {
    session: JSON.parse(decodeURI(sessionHeader)) as Record<
      string,
      unknown
    >, timeout: timeoutHeader ? JSON.parse(timeoutHeader) as number : undefined
  };
}
