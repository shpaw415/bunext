import { _Database, Table } from "../database/class";
import { generateRandomString } from "../features/utils";
import { Database } from "bun:sqlite";
let db: Database | undefined = undefined;

export async function InitDatabase() {
  const type = globalThis.serverConfig.session?.type;
  if (type == "cookie") return undefined;
  else if (type == "database:hard") {
    if (!(await Bun.file("./config/session.sqlite").exists())) {
      db = new Database("./config/session.sqlite", {
        create: true,
      });
      return;
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
