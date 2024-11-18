import { Database as _BunDB } from "bun:sqlite";
import type { _DataType, DBSchema, TableSchema } from "./schema";

declare global {
  var dbShema: DBSchema;
}

globalThis.dbShema ??= (
  await import(`${process.cwd()}/config/database.ts`)
).default;

const MainDatabase = new _BunDB("./config/bunext.sqlite", {
  create: true,
});

export class _Database {
  databaseInstence: _BunDB;

  constructor(db?: _BunDB) {
    this.databaseInstence = db || MainDatabase;
  }

  create(data: _Create) {
    let hasPrimary = false;
    let queryString = `CREATE TABLE IF NOT EXISTS ${data.name} `;
    queryString +=
      "(" +
      data.columns
        .map((column) => {
          if (typeof column.primary) hasPrimary = true;
          let dataType: string;
          let autoIncrement = "";
          switch (column.type) {
            case "number":
              dataType = "INTEGER";
              autoIncrement = column.autoIncrement ? "AUTOINCREMENT" : "";
              break;
            case "Date":
            case "boolean":
              dataType = "INTEGER";
              break;
            case "float":
              dataType = "REAL";
              break;
            case "json":
            case "string":
              dataType = "TEXT";
              break;
          }

          if (
            Array.isArray(column.default) ||
            typeof column.default == "object"
          ) {
            column.default = `'${JSON.stringify(column.default)}'`;
          } else if (typeof column.default == "string") {
            column.default = `'${column.default}'`;
          } else if (typeof column.default == "boolean") {
            column.default = column.default == true ? 1 : 0;
          } else if (column.default instanceof Date) {
            column.default = column.default.getTime();
          }

          const StrQuery = `${column.name} ${dataType}${column.primary ? " PRIMARY KEY " : ""
            }${autoIncrement}${column.nullable ? "" : " NOT NULL"}${column.unique ? " UNIQUE" : ""
            }${column.default != undefined
              ? ` DEFAULT ${column.default as string}`
              : ""
            }`;

          return StrQuery;
        })
        .join(", ") +
      ")";

    if (!hasPrimary)
      throw new Error(`Table ${data.name} do not have any Primary key.`, {
        cause: "PRIMARY KEY",
      });
    const prepare = this.databaseInstence.query(queryString);
    prepare.run();
  }
}
type OptionsFlags<Type> = {
  [Property in keyof Type]: boolean;
};

type _Select<Table> = {
  where?: _Where<Table>;
  select?: Partial<OptionsFlags<Table>> | "*";
  limit?: number;
  skip?: number;
};
type _Insert<Table> = Table;

type _Where<Table> =
  | Partial<Table>
  | _WhereOR<Table>;

type _WhereOR<Table> = {
  OR: Partial<Table>[];
};

type _Update<Table> = {
  where?: _Where<Table>;
  values: Partial<Table>;
};

type _Delete<Table> = {
  where: _Where<Table>;
};

type _Count<Table> = {
  where?: _Where<Table>
}

type _Create = TableSchema;

type _FormatString<T, SELECT_FORMAT> = _Select<SELECT_FORMAT> | _Update<T> | _Delete<T> | _Count<T>;

export class Table<T, SELECT_FORMAT> {
  private name: string;
  databaseInstence: _BunDB;
  shema: DBSchema;
  constructor({
    name,
    db,
    shema,
  }: {
    name: string;
    db?: _BunDB;
    shema?: DBSchema;
  }) {
    this.name = name;
    this.databaseInstence = db || MainDatabase;
    this.shema = shema || globalThis.dbShema;
  }
  private extractParams(key: string, where: any) {
    return Array.prototype.concat(
      ...(where[key] as Array<Partial<T>>).map((data) =>
        Object.keys(data).map((v) => (data as any)[v])
      )
    ).filter((e) => e != undefined) as string[];
  }
  private parseParams(params: any[]) {
    return params.map((param) => {
      const passType = ["number", "string"];
      if (passType.includes(typeof param)) return param;
      if (typeof param == "boolean") return param ? 1 : 0;
      return JSON.stringify(param);
    });
  }
  private restoreParams(params: any) {
    return Object.assign(
      {},
      ...Object.keys(params).map((key) => {
        const column = this.shema
          .find((schema) => schema.name === this.name)
          ?.columns.find((c) => c.name === key);
        switch (column?.type) {
          case "Date":
            return { [key]: new Date(params[key]) };
          case "json":
            return {
              [key]: JSON.parse(params[key]),
            };
          case "boolean":
            return { [key]: params[key] == 1 ? true : false };
          default:
            return { [key]: params[key] };
        }
      })
    );
  }
  private hasOR(data: _FormatString<T, SELECT_FORMAT>) {
    return data.where && Object.keys(data.where).find((e) => e == "OR")
      ? true
      : false;
  }
  private extractAndOrParams(data: _FormatString<T, SELECT_FORMAT>) {
    let params: string[] = [];
    if (data.where && !this.hasOR(data)) params = Object.values(data.where).filter((e) => e != undefined);
    else if (data.where && typeof (data.where as any)["OR"] !== "undefined")
      params = this.extractParams("OR", data.where);
    else if (data.where && typeof (data.where as any)["AND"] !== "undefined")
      params = this.extractParams("AND", data.where);

    return params;
  }
  private formatQueryString(data: _FormatString<T, SELECT_FORMAT>) {
    let queyString = "";

    const hasOR = this.hasOR(data);

    if (data.where && !hasOR) {
      queyString +=
        "WHERE " +
        (Object.keys(data.where) as Array<keyof _Select<T>["where"]>)
          .filter((k) => (data.where as any)[k] != undefined)
          .map((where) => {
            return `${where} = ?`;
          })
          .join(" AND ");
    } else if (data.where && hasOR) {
      const ORlist = (data.where as _Where<T> & { OR: Array<Partial<T>> }).OR;
      if (!Array.isArray(ORlist)) {
        console.error("Database Error:\n", ORlist);
        throw new Error("Database query failed: OR params need to be an array");
      }
      else queyString +=
        "WHERE " +
        ORlist.map((or) => {
          return Object.keys(or)
            .map((key) => {
              return `${key} = ?`;
            })
            .join(" AND ");
        }).join(" OR ");
    }
    return queyString;
  }

  select(data: _Select<SELECT_FORMAT>) {

    if (this.hasOR(data) && data.where && (data.where as _WhereOR<SELECT_FORMAT>).OR.length == 0) return [];

    if (data.where) {
      data.where = Object.assign(
        {},
        ...(Object.keys(data.where) as Array<keyof _Where<SELECT_FORMAT>>)
          .filter((k) => (data.where as _Where<SELECT_FORMAT>)[k] != undefined)
          .map((k) => {
            return {
              [k]: (data.where as _Where<SELECT_FORMAT>)[k],
            };
          })
      );
      if (Object.values(data.where as any).length == 0) data.where = undefined;
    }

    let queyString = "SELECT ";
    if (typeof data.select !== "undefined" && data.select != "*") {
      queyString += Object.keys(data.select)
        .filter((val) => (data.select as any)[val])
        .join(", ");
    } else queyString += "*";

    queyString += ` FROM ${this.name} ${this.formatQueryString(data)}`;
    if (data.limit) queyString += ` LIMIT ${data.limit}`;
    else if (data.skip) queyString += ` LIMIT -1`;

    if (data.skip) queyString += ` OFFSET ${data.skip}`;

    const query = this.databaseInstence.prepare(queyString);
    const res = query.all(...this.extractAndOrParams(data));
    query.finalize();

    return res.map((row) => this.restoreParams(row)) as Partial<SELECT_FORMAT>[];
  }
  insert(data: _Insert<T>[]) {
    let queryString = `INSERT INTO ${this.name} (${Object.keys(
      (data as any)[0]
    ).join(", ")}) VALUES (${Object.keys((data as any)[0]).map(
      (v) => `$${v}`
    )})`;
    const db = this.databaseInstence.prepare(queryString);

    const inserter = this.databaseInstence.transaction((entries) => {
      for (const entry of entries) db.run(entry);
    });
    const entries = data.map((entry) =>
      Object.assign(
        {},
        ...Object.keys(entry as any).map((e) => {
          return {
            [`$${e}`]: this.parseParams([(entry as any)[e]])[0],
          };
        })
      )
    );
    return inserter(entries) as void;
  }
  update(data: _Update<T>) {
    let queryString = `UPDATE ${this.name} SET `;

    let params: string[] = Object.values(data.values);
    queryString += Object.keys(data.values)
      .map((key) => `${key} = ?`)
      .join(", ");
    queryString += ` ${this.formatQueryString(data)}`;

    if (this.hasOR(data)) params.push(...this.extractParams("OR", data.where));
    else if (data.where) params.push(...Object.values(data.where));

    const db = this.databaseInstence.prepare(queryString);
    const res = db.all(...this.parseParams(params)) as T[];
    return res;
  }
  delete(data: _Delete<T>) {

    if (this.hasOR(data) && data.where && (data.where as _WhereOR<T>).OR.length == 0) return;

    const queyString = `DELETE FROM ${this.name} ${this.formatQueryString(data)}`;

    const query = this.databaseInstence.prepare(queyString);
    query.all(...this.extractAndOrParams(data));
    query.finalize();
  }
  count(data?: _Count<T>) {
    if (data && this.hasOR(data) && data.where && (data.where as _WhereOR<T>).OR.length == 0) return 0;

    const queryString = `SELECT COUNT(*) FROM ${this.name} ${data ? this.formatQueryString(data) : ""}`;


    const query = this.databaseInstence.prepare(queryString);
    const res = query.all(...(data ? this.extractAndOrParams(data) : []));
    query.finalize();

    return (res as Array<{ "COUNT(*)": number }>)[0]["COUNT(*)"];
  }
}
