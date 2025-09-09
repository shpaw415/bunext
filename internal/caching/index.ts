"server only";

import { _Database, DatabaseManager, Table, type PoolConfig, type PooledConnection } from "database/class";
import type { _DataType, DBSchema } from "database/schema";


type CacheManagerPoolConfig = { schema: DBSchema; dbPath?: string, poolConfig?: Partial<PoolConfig> };

class CacheManagerPool {
  private db!: DatabaseManager;
  private dbSchema!: DBSchema;

  static async create(config: CacheManagerPoolConfig) {
    const instance = new CacheManagerPool();
    await instance.initialize(config);
    return instance;
  }

  async initialize({ schema, dbPath, poolConfig }: CacheManagerPoolConfig) {
    this.dbSchema = schema;
    const conf: Partial<PoolConfig> = {
      maxConnections: 10,
      minConnections: 5,
      enableQueryCache: false,
      enableLogging: false,
      idleTimeout: 30000,
      ...poolConfig
    };
    this.db = await new _Database().withPooling({
      dbPath: dbPath || (import.meta.dirname + "/cache.sqlite"),
      poolConfig: conf,
    });
    for (const tab of this.dbSchema) {
      this.db.create(tab);
    }
  }

  async getTable<T1 extends {}, T2 extends {}, T3 extends unknown = unknown>(name: string, then?: (table: Table<T1, T2>) => T3 | Promise<T3>): Promise<T3> {
    const db = (await this.db.getPooledConnection());
    if (!db) throw new Error("Database connection not available");
    const table = new Table<T1, T2>({
      db: db.database,
      name,
      schema: this.dbSchema,
      enableWAL: true,
    });
    const res = await then?.(table) as T3;
    this.close(db);
    return res;
  }

  close(connection: PooledConnection) {
    return this.db.releasePooledConnection(connection);
  }
}

type CacheManagerPoolDefaultConfigShemaType<T> = {
  id?: number;
  tag: string;
  key: string;
  value?: T;
  expiresAt?: Date;
}

const CacheManagerPoolDefaultConfig: CacheManagerPoolConfig = {
  schema: [{
    name: "cache",
    columns: [
      {
        name: "id",
        type: "number",
        primary: true,
        autoIncrement: true,
        unique: true,
      },
      {
        name: "tag",
        type: "string"
      },
      {
        name: "key",
        type: "string",
        unique: true,
      },
      {
        name: "value",
        type: "json",
        DataType: {},
        nullable: true
      },
      { name: "expiresAt", type: "Date", nullable: true }
    ]
  }],
  poolConfig: {
    maxConnections: 10,
    minConnections: 5,
    enableLogging: false,
  }
};


export type CacheManagerOptions = {
  clearTimeout?: number; // in ms, default 60000 * 60 (1 hour)
};
class CacheManager<T extends Record<string, unknown>> {
  private cache!: CacheManagerPool;
  private tag: string;


  constructor(tag: string, options: CacheManagerOptions) {
    this.tag = tag;
    if (arguments[2] != "_") throw new Error("CacheManager must be created with CacheManager.create()");
    if (options.clearTimeout && options.clearTimeout > 0) {
      setInterval(() => {
        this.clearExpired();
      }, options.clearTimeout);
    } else {
      setInterval(() => {
        this.clearExpired();
      }, 60000 * 60); // default 1 hour
    }
  }

  static async create<T extends Record<string, unknown>>(tag: string, config?: { dbPath?: string, poolConfig?: Partial<PoolConfig>, clearExpiredTimeout?: number }) {
    //@ts-ignore
    const instance = new CacheManager<T>(tag, { clearTimeout: config?.clearExpiredTimeout }, "_");
    await instance.__initialize__(config);
    return instance;
  }

  async __initialize__(config?: { dbPath?: string, poolConfig?: Partial<PoolConfig> }) {
    this.cache = await CacheManagerPool.create({
      dbPath: config?.dbPath || import.meta.dirname + "/cache.sqlite",
      ...CacheManagerPoolDefaultConfig,
      poolConfig: {
        ...CacheManagerPoolDefaultConfig.poolConfig,
        ...config?.poolConfig
      }
    });
  }

  private cacheTable<K>(callback: (table: Table<CacheManagerPoolDefaultConfigShemaType<T>, CacheManagerPoolDefaultConfigShemaType<T>>) => K): Promise<K> {
    return this.cache.getTable("cache", callback);
  }

  public set(key: string, value: T, expiresAt?: Date) {
    return this.cacheTable((table) => {
      table.upsert([
        {
          tag: this.tag,
          key: this.tag + ":" + key,
          value,
          expiresAt
        }
      ], ["key"], ["value", "expiresAt"]);
    });
  }

  public get(key: string): Promise<T | null> {
    return this.cacheTable<T | null>(table => {
      const res = table.findFirst({
        where: {
          tag: this.tag,
          key: this.tag + ":" + key
        },
        select: {
          value: true,
          expiresAt: true
        }
      });

      if (!res) return null;
      if (res.expiresAt && res.expiresAt.getTime() < Date.now()) {
        this.delete(key);
        return null;
      }

      return res.value || null;
    });
  }

  public delete(key: string) {
    return this.cacheTable(table => {
      return table.delete({
        where: {
          tag: this.tag,
          key: this.tag + ":" + key
        },
      });
    });
  }
  /**
   * Clears the cache for the current tag.
   */
  public clear() {
    return this.cacheTable(table => {
      return table.delete({
        where: {
          tag: this.tag
        }
      });
    });
  }
  public getAll() {
    return this.cacheTable(table => {
      const res = table.select({
        where: {
          tag: this.tag,
        },
        select: {
          value: true,
          expiresAt: true,
          key: true
        }
      });

      if (!res) return null;
      const valid = res.filter(r => r.expiresAt && r.expiresAt.getTime() > Date.now()).map(r => r.value);
      const expired = res.filter(r => !r.expiresAt || (r.expiresAt && r.expiresAt.getTime() < Date.now()));
      this.cacheTable(t => t.delete({
        where: {
          OR: [...expired.map(e => ({ key: this.tag + ":" + e.key }))]
        }
      }))

      return valid || null;
    });
  }
  /**
   * Clears all expired cache entries for the current tag.
   * @returns 
   */
  public clearExpired() {
    return this.cacheTable(table => {
      return table.delete({
        where: {
          tag: this.tag,
          lessThan: {
            expiresAt: new Date()
          }
        }
      });
    });
  }
  /**
   * Retrieves all expired cache entries for the current tag.
   * @returns All expired cache entries for the current tag.
   */
  public getEpired() {
    return this.cacheTable(table => {
      return table.select({
        where: {
          tag: this.tag,
          lessThan: {
            expiresAt: new Date()
          }
        }
      });
    });
  }
}

export { CacheManagerPool, CacheManager };
