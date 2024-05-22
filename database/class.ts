"use client";
import { Database as _BunDB } from "bun:sqlite";
import type { _DataType, DBSchema, TableSchema } from "./schema";

declare global {
  var dbShema: DBSchema;
}

globalThis.dbShema ??= (
  await import(`${process.cwd()}/config/database.ts`)
).default;

const BunDB = new _BunDB("./config/bunext.sqlite", {
  create: true,
});

export class _Database {
  create(data: _Create) {
    let hasPrimary = false;
    let queryString = `CREATE TABLE IF NOT EXISTS ${data.name} `;
    queryString +=
      "(" +
      data.columns
        .map((column) => {
          if (column.primary) hasPrimary = true;
          let dataType: string;
          let autoIncrement = "";
          switch (column.type) {
            case "number":
              dataType = "INTEGER";
              autoIncrement = column.autoIncrement ? "AUTOINCREMENT" : "";
              break;
            case "Date":
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

          return `${column.name} ${dataType}${
            column.primary ? " PRIMARY KEY " : ""
          }${autoIncrement}${column.nullable ? "" : " NOT NULL"}${
            column.unique ? " UNIQUE" : ""
          }${column.default ? ` DEFAULT ${column.default}` : ""}`;
        })
        .join(", ") +
      ")";
    if (!hasPrimary)
      throw new Error(`Table ${data.name} do not have any Primary key.`, {
        cause: "PRIMARY KEY",
      });
    const db = BunDB.query(queryString);
    db.run();
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

type _Where<Table> = { OR: Partial<Table>[]; AND?: undefined } | Partial<Table>;

type _Update<Table> = {
  where: _Where<Table>;
  values: Partial<Table>;
  skip?: number;
  limit?: number;
};

type _Delete<Table> = {
  where: _Where<Table>;
  limit?: number;
  skip?: number;
};

type _Create = TableSchema;

export class Table<T> {
  private name: string;
  constructor({ name }: { name: string }) {
    this.name = name;
  }
  private extractParams(key: string, where: any) {
    return Array.prototype.concat(
      ...(where[key] as Array<Partial<T>>).map((data) =>
        Object.keys(data).map((v) => (data as any)[v])
      )
    ) as string[];
  }
  private parseParams(params: any[]) {
    return params.map((param) => {
      const passType = ["number", "string", "boolean"];
      if (passType.includes(typeof param)) return param;
      return JSON.stringify(param);
    });
  }
  private restoreParams(params: any) {
    return Object.assign(
      {},
      ...Object.keys(params).map((key) => {
        const column = globalThis.dbShema
          .find((schema) => schema.name === this.name)
          ?.columns.find((c) => c.name === key);
        if (column?.type === "Date") return { [key]: new Date(params[key]) };
        if (column?.type === "json") {
          column.DataType;
          return {
            [key]: JSON.parse(params[key]),
          };
        } else return { [key]: params[key] };
      })
    );
  }
  select(data: _Select<T>) {
    let queyString = "SELECT ";
    if (typeof data.select !== "undefined" && data.select != "*") {
      queyString += Object.keys(data.select)
        .filter((val) => (data.select as any)[val])
        .join(", ");
    } else queyString += "*";

    queyString += ` FROM ${this.name}`;
    const hasORAND =
      data.where &&
      Object.keys(data.where).filter((k) => k == "OR" || k == "AND").length == 0
        ? false
        : true;

    if (data.where && !hasORAND) {
      queyString +=
        " WHERE " +
        (Object.keys(data.where) as Array<keyof _Select<T>["where"]>)
          .map((where) => {
            return `${where} = ?`;
          })
          .join(", ");
    } else if (data.where && Object.keys(data.where)[0] == "OR") {
      const ORlist = (data.where as any)["OR"] as Partial<T>[];
      queyString +=
        " WHERE " +
        ORlist.map((or) => {
          return Object.keys(or).map((key) => {
            return `${key} = ?`;
          });
        }).join(" OR ");
    }

    if (data.limit) queyString += ` LIMIT ${data.limit}`;
    else if (data.skip) queyString += ` LIMIT -1`;

    if (data.skip) queyString += ` OFFSET ${data.skip}`;

    let params: string[] = [];
    if (data.where && !hasORAND) params = Object.values(data.where);
    else if (data.where && typeof (data.where as any)["OR"] !== "undefined")
      params = this.extractParams("OR", data.where);
    else if (data.where && typeof (data.where as any)["AND"] !== "undefined")
      params = this.extractParams("AND", data.where);

    const query = BunDB.prepare(queyString);
    let res = query.all(...params) as Partial<T>[];
    query.finalize();

    return res.map((row) => this.restoreParams(row)) as Partial<T>[];
  }
  insert(data: _Insert<T>[]) {
    let queryString = `INSERT INTO ${this.name} (${Object.keys(
      (data as any)[0]
    ).join(", ")}) VALUES (${Object.keys((data as any)[0]).map(
      (v) => `$${v}`
    )})`;
    const db = BunDB.prepare(queryString);

    const inserter = BunDB.transaction((entries) => {
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
    return inserter(entries) as number;
  }
  update(data: _Update<T>) {
    let queryString = `UPDATE ${this.name} SET `;

    const isOR = Object.keys(data.where)[0] === "OR";

    let params: string[] = Object.values(data.values);
    queryString += Object.keys(data.values)
      .map((key) => `${key} = ?`)
      .join(", ");
    queryString += " WHERE ";
    if (isOR) {
      params.push(...this.extractParams("OR", data.where));
      queryString += ((data.where as any)["OR"] as string[])
        .map((k) => Object.keys(k).map((v) => `${v} = ?`))
        .join(" OR ");
    } else {
      const where = Object.keys(data.where);
      params.push(...Object.values(data.where));
      queryString += where.map((v) => `${v} = ?`).join(" AND ");
    }
    const db = BunDB.prepare(queryString);
    const res = db.all(...this.parseParams(params)) as T[];
    return res;
  }
  delete(data: _Delete<T>) {
    let queyString = `DELETE FROM ${this.name} `;

    const hasORAND =
      data.where &&
      Object.keys(data.where).filter((k) => k == "OR" || k == "AND").length == 0
        ? false
        : true;

    if (data.where && !hasORAND) {
      queyString +=
        " WHERE " +
        (Object.keys(data.where) as Array<keyof _Select<T>["where"]>)
          .map((where) => {
            return `${where} = ?`;
          })
          .join(", ");
    } else if (data.where && Object.keys(data.where)[0] == "OR") {
      const ORlist = (data.where as any)["OR"] as Partial<T>[];
      queyString +=
        " WHERE " +
        ORlist.map((or) => {
          return Object.keys(or).map((key) => {
            return `${key} = ?`;
          });
        }).join(" OR ");
    }

    if (data.limit) queyString += ` LIMIT ${data.limit}`;
    else if (data.skip) queyString += ` LIMIT -1`;

    if (data.skip) queyString += ` OFFSET ${data.skip}`;

    let params: string[] = [];
    if (data.where && !hasORAND) params = Object.values(data.where);
    else if (data.where && typeof (data.where as any)["OR"] !== "undefined")
      params = this.extractParams("OR", data.where);
    else if (data.where && typeof (data.where as any)["AND"] !== "undefined")
      params = this.extractParams("AND", data.where);

    const query = BunDB.prepare(queyString);
    let res = query.all(...params) as Partial<T>[];
    query.finalize();
  }
}
