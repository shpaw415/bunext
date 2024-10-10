import type Database from "bun:sqlite";
import { _Database, Table } from "../database/class";
import { generateRandomString } from "../features/utils";

async function MakeDatabase() {
  const { Database } = await import("bun:sqlite");
  const type = globalThis.serverConfig.session?.type;
  if (type == "cookie") return undefined;
  else if (type == "database:hard") {
    if (!(await Bun.file("./config/session.sqlite").exists())) {
      return new Database("./config/session.sqlite");
    }
    return CreateDatabaseTable(
      new Database("./config/session.sqlite", {
        create: true,
      })
    );
  } else if (type == "database:memory") {
    return CreateDatabaseTable(
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

const db = await MakeDatabase();

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

export function GetSessionByID(id?: string): undefined | object {
  if (!db || !id) return;
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
