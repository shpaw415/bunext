"server only";

import { _Database, DatabaseManager, Table, type PoolConfig, type PooledConnection } from "../../database/class";
import type { _DataType, DBSchema } from "../../database/schema";
import { type _Head } from "../../features/head";


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

export { CacheManagerPool };
