import type { ClusterMessageType } from "./types";
import { _Database, Table } from "../database/class";
import type { TableSchema } from "@bunpmjs/bunext/database/schema";
import type { Database } from "bun:sqlite";
import cluster from "node:cluster";

let db: Database | undefined = undefined;

const throwOnDBNotInited = () => {
  throw new Error("session database not initialized");
};
const SendWhenOptionMemory = (msg: ClusterMessageType) => {
  if (
    cluster.isWorker &&
    globalThis.serverConfig.session?.type == "database:memory"
  ) {
    process.send?.(msg);
    return true;
  }
  return false;
};

const Shema: TableSchema = {
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
      DataType: {
        public: {},
        private: {},
      },
    },
  ],
};

export async function InitDatabase() {
  const { Database } = await import("bun:sqlite");
  const type = globalThis.serverConfig.session?.type;
  if (type == "cookie") return;
  else if (type == "database:hard") {
    db = CreateDatabaseTable(
      new Database("./config/session.sqlite", {
        create: true,
      })
    );
  } else if (type == "database:memory") {
    db = CreateDatabaseTable(
      new Database(":memory:", {
        create: true,
      })
    );
  }
  db?.exec("PRAGMA journal_mode = WAL;");
}

function CreateDatabaseTable(db: Database) {
  new _Database(db).create(Shema);
  return db;
}

type sessionTableType = {
  data: {
    public: any;
    private: any;
  };
  id: string;
};

function GetTable() {
  return new Table<sessionTableType, sessionTableType>({
    name: "bunextSession",
    db,
    shema: [Shema],
  });
}

class IPCManager {
  awaiter: Array<{
    id: string;
    resolve: (value: undefined | sessionTableType["data"]) => void;
  }> = [];

  constructor() {
    process.on("message", (_message) => {
      const message = _message as ClusterMessageType;

      if (message.task == "getSession") {
        for (const waiter of this.awaiter) {
          if (waiter.id == message.data.id) {
            waiter.resolve(
              message.data.data == false ? undefined : message.data.data
            );
            this.awaiter.splice(
              this.awaiter.findIndex((e) => e.id == waiter.id),
              1
            );
          }
        }
      }
    });
  }
  awaitSessionData(id: string) {
    return new Promise<undefined | sessionTableType["data"]>((resolve) => {
      this.awaiter.push({
        id,
        resolve,
      });
    });
  }
}

const IPCManagerInstance = new IPCManager();

export function GetSessionByID(
  id?: string
):
  | Promise<undefined | sessionTableType["data"]>
  | undefined
  | sessionTableType["data"] {
  if (!id) return;
  if (
    SendWhenOptionMemory({
      task: "getSession",
      data: {
        id,
      },
    })
  )
    return IPCManagerInstance.awaitSessionData(id);

  if (!db) return;
  const table = GetTable();

  const res = table.select({
    where: {
      id,
    },
    select: {
      data: true,
    },
  });

  if (res.length == 0) return undefined;
  return res[0].data;
}
/**
 * create or update session
 * @param id the session id or undefined
 * @returns newly created session id or undefined
 */
export function SetSessionByID(
  type: "insert" | "update",
  id: string,
  data?: any
) {
  if (
    SendWhenOptionMemory({
      task: "setSession",
      data: {
        id: id,
        sessionData: data,
        type,
      },
    })
  )
    return;

  if (!db) throwOnDBNotInited();
  const table = GetTable();

  if (type == "insert") {
    table.insert([
      {
        id: id,
        data: data || {
          public: {},
          private: {},
        },
      },
    ]);
  } else if (type == "update") {
    const exists = table.select({ where: { id }, select: { id: true } }).at(0);
    if (!exists) return SetSessionByID("insert", id, data);
    table.update({
      where: {
        id,
      },
      values: {
        data: data || {
          public: {},
          private: {},
        },
      },
    });
  }
}

export function DeleteSessionByID(id: string) {
  if (
    SendWhenOptionMemory({
      task: "deleteSession",
      data: {
        id: id,
      },
    })
  )
    return;

  if (!db) throwOnDBNotInited();

  GetTable().delete({
    where: { id },
  });
}

export function CleanExpiredSession() {
  if (!globalThis.serverConfig.session?.timeout) return;
  const Tab = GetTable();
  const toDelete = Tab.select({}).filter(({ data }) => {
    const createdTime = data?.private.__BUNEXT_SESSION_CREATED_AT__;
    const Timeout = globalThis.serverConfig.session?.timeout as number;
    return new Date().getTime() > createdTime + Timeout * 1000;
  });

  if (toDelete.length == 0) return;

  Tab.delete({
    where: {
      OR: toDelete.map(({ id }) => {
        return {
          id,
        };
      }),
    },
  });
}
