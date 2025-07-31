import type { ClusterMessageType } from "./types";
import { _Database, Table } from "../database/class";
import type { TableSchema } from "../database/schema";
import type { Database } from "bun:sqlite";
import cluster from "node:cluster";

/**
 * Session configuration types
 */
export type SessionType = "cookie" | "database:hard" | "database:memory";

export interface SessionData {
  public: Record<string, any>;
  private: Record<string, any>;
}

export interface SessionRecord {
  id: string;
  data: SessionData;
  createdAt?: number;
  lastAccessed?: number;
}

/**
 * Session management errors
 */
export class SessionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class SessionNotInitializedError extends SessionError {
  constructor() {
    super("Session database not initialized", "SESSION_NOT_INITIALIZED");
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(id: string) {
    super(`Session with ID ${id} not found`, "SESSION_NOT_FOUND");
  }
}

/**
 * Environment detection utilities
 */
const isServerSide = (): boolean => {
  return typeof window === "undefined" && typeof process !== "undefined";
};

const isClientSide = (): boolean => {
  return typeof window !== "undefined";
};

const isWorkerProcess = (): boolean => {
  return isServerSide() && cluster.isWorker;
};

/**
 * Global session state
 */
let db: Database | undefined = undefined;
let isInitialized = false;

/**
 * Validation utilities
 */
const validateSessionId = (id: string): boolean => {
  return typeof id === "string" && id.length > 0 && id.length <= 255;
};

const validateSessionData = (data: any): data is SessionData => {
  return (
    data &&
    typeof data === "object" &&
    typeof data.public === "object" &&
    typeof data.private === "object"
  );
};
/**
 * IPC communication for worker processes
 */
const sendToMainProcess = (msg: ClusterMessageType): boolean => {
  if (
    isWorkerProcess() &&
    globalThis.serverConfig?.session?.type === "database:memory"
  ) {
    try {
      process.send?.(msg);
      return true;
    } catch (error) {
      console.error("Failed to send IPC message:", error);
      return false;
    }
  }
  return false;
};

/**
 * Database schema definition
 */
const SESSION_SCHEMA: TableSchema = {
  name: "bunextSession",
  columns: [
    {
      name: "id",
      unique: true,
      primary: true,
      type: "string",
    },
    {
      name: "data",
      type: "json",
      DataType: {} as any, // Using any to bypass type checking for DataType
    },
  ],
};

/**
 * Session database initialization
 */
export async function initializeSessionDatabase(): Promise<void> {
  if (isClientSide()) {
    console.warn("Session database initialization called on client side");
    return;
  }

  try {
    const { Database } = await import("bun:sqlite");
    const sessionType = globalThis.serverConfig?.session?.type;

    if (sessionType === "cookie") {
      isInitialized = true;
      return;
    }

    let database: Database;

    if (sessionType === "database:hard") {
      database = new Database("./config/session.sqlite", { create: true });
    } else if (sessionType === "database:memory") {
      database = new Database(":memory:", { create: true });
    } else {
      throw new SessionError(`Invalid session type: ${sessionType}`, "INVALID_SESSION_TYPE");
    }

    // Create tables and optimize database
    createDatabaseTables(database);
    optimizeDatabase(database);

    db = database;
    isInitialized = true;

  } catch (error) {
    console.error("Failed to initialize session database:", error);
    throw new SessionError(
      `Session initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      "INITIALIZATION_FAILED"
    );
  }
}

/**
 * Create database tables with schema
 */
function createDatabaseTables(database: Database): void {
  try {
    new _Database(database).create(SESSION_SCHEMA);
  } catch (error) {
    throw new SessionError(
      `Failed to create database tables: ${error instanceof Error ? error.message : String(error)}`,
      "TABLE_CREATION_FAILED"
    );
  }
}

/**
 * Optimize database performance
 */
function optimizeDatabase(database: Database): void {
  try {
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec("PRAGMA synchronous = NORMAL;");
    database.exec("PRAGMA cache_size = 1000;");
    database.exec("PRAGMA temp_store = memory;");
  } catch (error) {
    console.warn("Failed to optimize database:", error);
  }
}

/**
 * Get database table instance
 */
function getSessionTable(): Table<SessionRecord, SessionRecord> {
  if (!db) {
    throw new SessionNotInitializedError();
  }

  return new Table<SessionRecord, SessionRecord>({
    name: "bunextSession",
    db,
    schema: [SESSION_SCHEMA],
  });
}

/**
 * Enhanced IPC Manager for worker communication
 */
class SessionIPCManager {
  private waitingPromises = new Map<string, {
    resolve: (value: SessionData | undefined) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }>();

  private readonly TIMEOUT_MS = 5000; // 5 second timeout

  constructor() {
    if (isServerSide()) {
      this.initializeMessageHandler();
      this.startTimeoutCleanup();
    }
  }

  private initializeMessageHandler(): void {
    process.on("message", (message: ClusterMessageType) => {
      try {
        if (message.task === "getSession") {
          this.handleSessionResponse(message.data.id, message.data.data);
        }
      } catch (error) {
        console.error("Error handling IPC message:", error);
      }
    });
  }

  private handleSessionResponse(id: string, data: SessionData | false): void {
    const waiting = this.waitingPromises.get(id);
    if (waiting) {
      this.waitingPromises.delete(id);
      waiting.resolve(data === false ? undefined : data);
    }
  }

  private startTimeoutCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, { reject, timestamp }] of this.waitingPromises.entries()) {
        if (now - timestamp > this.TIMEOUT_MS) {
          this.waitingPromises.delete(id);
          reject(new SessionError(`Session request timeout for ID: ${id}`, "TIMEOUT"));
        }
      }
    }, 1000);
  }

  async awaitSessionData(id: string): Promise<SessionData | undefined> {
    return new Promise((resolve, reject) => {
      this.waitingPromises.set(id, {
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Set timeout
      setTimeout(() => {
        if (this.waitingPromises.has(id)) {
          this.waitingPromises.delete(id);
          reject(new SessionError(`Session request timeout for ID: ${id}`, "TIMEOUT"));
        }
      }, this.TIMEOUT_MS);
    });
  }
}

const sessionIPCManager = new SessionIPCManager();

/**
 * Retrieve session data by ID
 */
export async function getSessionById(
  id?: string
): Promise<SessionData | undefined> {
  if (!id || !validateSessionId(id)) {
    return undefined;
  }

  try {
    // Handle worker process communication
    if (sendToMainProcess({
      task: "getSession",
      data: { id },
    })) {
      return await sessionIPCManager.awaitSessionData(id);
    }

    // Handle direct database access
    if (!db) {
      if (isClientSide()) {
        console.warn("Session database not available on client side");
        return undefined;
      }
      throw new SessionNotInitializedError();
    }

    const table = getSessionTable();
    const results = table.select({
      where: { id },
      select: { data: true },
    });

    if (results.length === 0) {
      return undefined;
    }

    const sessionData = results[0].data;
    if (!validateSessionData(sessionData)) {
      console.warn(`Invalid session data structure for ID: ${id}`);
      return undefined;
    }

    return sessionData;
  } catch (error) {
    console.error(`Error retrieving session ${id}:`, error);
    if (error instanceof SessionError) {
      throw error;
    }
    throw new SessionError(
      `Failed to retrieve session: ${error instanceof Error ? error.message : String(error)}`,
      "RETRIEVAL_FAILED"
    );
  }
}

/**
 * Create or update session data
 */
export async function setSessionById(
  operation: "insert" | "update" | "upsert",
  id: string,
  data?: SessionData
): Promise<void> {
  if (!validateSessionId(id)) {
    throw new SessionError(`Invalid session ID: ${id}`, "INVALID_SESSION_ID");
  }

  const sessionData: SessionData = data || {
    public: {},
    private: {},
  };

  if (!validateSessionData(sessionData)) {
    throw new SessionError("Invalid session data structure", "INVALID_SESSION_DATA");
  }

  try {
    // Handle worker process communication
    if (sendToMainProcess({
      task: "setSession",
      data: {
        id,
        sessionData,
        type: operation === "upsert" ? "update" : operation, // Convert upsert to update for IPC
      },
    })) {
      return;
    }

    // Handle direct database access
    if (!db) {
      if (isClientSide()) {
        throw new SessionError("Session database not available on client side", "CLIENT_SIDE_ERROR");
      }
      throw new SessionNotInitializedError();
    }

    const table = getSessionTable();

    // Add metadata
    const now = Date.now();
    const enhancedData: SessionData = {
      ...sessionData,
      private: {
        ...sessionData.private,
        __BUNEXT_SESSION_CREATED_AT__: sessionData.private.__BUNEXT_SESSION_CREATED_AT__ || now,
        __BUNEXT_SESSION_LAST_ACCESSED__: now,
      },
    };

    if (operation === "insert") {
      table.insert([{
        id,
        data: enhancedData,
      }]);
    } else if (operation === "update") {
      table.update({
        where: { id },
        values: { data: enhancedData },
      });
    } else if (operation === "upsert") {
      // Try update first, then insert if not exists
      const exists = table.select({
        where: { id },
        select: { id: true }
      }).length > 0;

      if (exists) {
        table.update({
          where: { id },
          values: { data: enhancedData },
        });
      } else {
        table.insert([{
          id,
          data: enhancedData,
        }]);
      }
    }
  } catch (error) {
    console.error(`Error setting session ${id}:`, error);
    if (error instanceof SessionError) {
      throw error;
    }
    throw new SessionError(
      `Failed to set session: ${error instanceof Error ? error.message : String(error)}`,
      "SET_FAILED"
    );
  }
}

/**
 * Delete session by ID
 */
export async function deleteSessionById(id: string): Promise<void> {
  if (!validateSessionId(id)) {
    throw new SessionError(`Invalid session ID: ${id}`, "INVALID_SESSION_ID");
  }

  try {
    // Handle worker process communication
    if (sendToMainProcess({
      task: "deleteSession",
      data: { id },
    })) {
      return;
    }

    // Handle direct database access
    if (!db) {
      if (isClientSide()) {
        throw new SessionError("Session database not available on client side", "CLIENT_SIDE_ERROR");
      }
      throw new SessionNotInitializedError();
    }

    const table = getSessionTable();
    const result = table.delete({
      where: { id },
    });

    console.log(`Session ${id} deleted successfully`);
  } catch (error) {
    console.error(`Error deleting session ${id}:`, error);
    if (error instanceof SessionError) {
      throw error;
    }
    throw new SessionError(
      `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`,
      "DELETE_FAILED"
    );
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanExpiredSessions(): Promise<number> {
  const timeout = globalThis.serverConfig?.session?.timeout;
  if (!timeout) {
    return 0;
  }

  if (isClientSide()) {
    console.warn("Session cleanup called on client side");
    return 0;
  }

  try {
    if (!db) {
      throw new SessionNotInitializedError();
    }

    const table = getSessionTable();
    const allSessions = table.select({});
    const now = Date.now();
    const timeoutMs = timeout * 1000;

    const expiredSessions = allSessions.filter((session: any) => {
      const createdTime = session.data?.private?.__BUNEXT_SESSION_CREATED_AT__;
      return createdTime && (now > createdTime + timeoutMs);
    });

    if (expiredSessions.length === 0) {
      return 0;
    }

    table.delete({
      where: {
        OR: expiredSessions.map((session: any) => ({ id: session.id })),
      },
    });

    console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    return expiredSessions.length;
  } catch (error) {
    console.error("Error cleaning expired sessions:", error);
    throw new SessionError(
      `Failed to clean expired sessions: ${error instanceof Error ? error.message : String(error)}`,
      "CLEANUP_FAILED"
    );
  }
}

/**
 * Additional utility functions and improvements
 */

/**
 * Check if session database is initialized
 */
export function isSessionInitialized(): boolean {
  return isInitialized;
}

/**
 * Get session statistics
 */
export async function getSessionStats(): Promise<{
  total: number;
  expired: number;
  active: number;
}> {
  if (isClientSide() || !db) {
    return { total: 0, expired: 0, active: 0 };
  }

  try {
    const table = getSessionTable();
    const allSessions = table.select({});
    const now = Date.now();
    const timeout = (globalThis.serverConfig?.session?.timeout || 0) * 1000;

    const total = allSessions.length;
    let expired = 0;

    if (timeout > 0) {
      expired = allSessions.filter((session: any) => {
        const createdTime = session.data?.private?.__BUNEXT_SESSION_CREATED_AT__;
        return createdTime && (now > createdTime + timeout);
      }).length;
    }

    return {
      total,
      expired,
      active: total - expired,
    };
  } catch (error) {
    console.error("Error getting session stats:", error);
    return { total: 0, expired: 0, active: 0 };
  }
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  if (isServerSide()) {
    return crypto.randomUUID();
  } else {
    // Fallback for environments without crypto.randomUUID
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

/**
 * Session exists check
 */
export async function sessionExists(id: string): Promise<boolean> {
  if (!validateSessionId(id)) {
    return false;
  }

  try {
    const sessionData = await getSessionById(id);
    return sessionData !== undefined;
  } catch (error) {
    console.error(`Error checking session existence for ${id}:`, error);
    return false;
  }
}

/**
 * Backward compatibility exports (deprecated)
 */
/** @deprecated Use initializeSessionDatabase instead */
export const InitDatabase = initializeSessionDatabase;

/** @deprecated Use getSessionById instead */
export const GetSessionByID = getSessionById;

/** @deprecated Use setSessionById instead */
export const SetSessionByID = (type: "insert" | "update", id: string, data?: any) => {
  console.warn("SetSessionByID is deprecated, use setSessionById instead");
  return setSessionById(type, id, data);
};

/** @deprecated Use deleteSessionById instead */
export const DeleteSessionByID = (id: string) => {
  console.warn("DeleteSessionByID is deprecated, use deleteSessionById instead");
  return deleteSessionById(id);
};

/** @deprecated Use cleanExpiredSessions instead */
export const CleanExpiredSession = () => {
  console.warn("CleanExpiredSession is deprecated, use cleanExpiredSessions instead");
  return cleanExpiredSessions();
};
