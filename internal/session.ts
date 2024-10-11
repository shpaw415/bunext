import type { ClusterMessageType } from "./types";
import { _Database, Table } from "../database/class";
import { generateRandomString } from "../features/utils";
import type { Database } from "bun:sqlite";
import cluster from "node:cluster";

let db: Database | undefined = undefined;

export async function InitDatabase() {
  const { Database } = await import("bun:sqlite");
  const type = globalThis.serverConfig.session?.type;
  console.log(type);
  if (type == "cookie") return;
  else if (type == "database:hard") {
    if (!(await Bun.file("./config/session.sqlite").exists())) {
      db = new Database("./config/session.sqlite", {
        create: true,
      });
    } else db = CreateDatabaseTable(new Database("./config/session.sqlite"));
  } else if (type == "database:memory") {
    db = CreateDatabaseTable(
      new Database(":memory:", {
        create: true,
      })
    );
  }
}

function CreateDatabaseTable(db: Database) {
  new _Database(db).create({
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
  });
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
  return new Table<sessionTableType>({
    name: "bunextSession",
    db,
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
    cluster.isWorker &&
    globalThis.serverConfig.session?.type == "database:memory"
  ) {
    process.send?.({
      task: "getSession",
      data: {
        id,
      },
    } as ClusterMessageType);

    return IPCManagerInstance.awaitSessionData(id);
  }

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
 * create or udate session
 * @param id the session id or undefined
 * @returns newley created session id or undefined
 */
export function SetSessionByID(id?: string, data?: any) {
  if (
    cluster.isWorker &&
    globalThis.serverConfig.session?.type == "database:memory"
  ) {
    process.send?.({
      task: "setSession",
      data: {
        id,
        sessionData: data,
      },
    } as ClusterMessageType);
  }
  if (!db) return;
  const table = GetTable();

  if (!id) {
    const newID = generateRandomString(32);
    table.insert([
      {
        id: newID,
        data: data || {
          public: {},
          private: {},
        },
      },
    ]);
    return newID;
  }

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
