import { Database as _BunDB } from "bun:sqlite";
import type { _DataType, DBSchema, TableSchema } from "./schema";

declare global {
  var dbShema: DBSchema;
  var MainDatabase: _BunDB;
}

try {
  globalThis.dbShema ??= (
    await import(`${process.cwd()}/config/database.ts`)
  ).default;

  globalThis.MainDatabase ??= new _BunDB("./config/bunext.sqlite", {
    create: true,
  });
  const MainDatabase = globalThis.MainDatabase;
  MainDatabase.exec("PRAGMA journal_mode = WAL;");
} catch {}

export class _Database {
  databaseInstance: _BunDB;

  constructor(db?: _BunDB) {
    this.databaseInstance = db || MainDatabase;
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

          const StrQuery = `${column.name} ${dataType}${
            column.primary ? " PRIMARY KEY " : ""
          }${autoIncrement}${column.nullable ? "" : " NOT NULL"}${
            column.unique ? " UNIQUE" : ""
          }${
            column.default != undefined
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
    const prepare = this.databaseInstance.query(queryString);
    prepare.run();
  }
}
type OptionsFlags<Type> = {
  [Property in keyof Type]: boolean;
};

type ReservedKeyWords = "LIKE" | "OR";
type TableExtends = Record<string | ReservedKeyWords, string | number>;

type _Select<Table extends TableExtends> = {
  where?: _Where<Table>;
  select?: Partial<OptionsFlags<Table>> | "*";
  limit?: number;
  skip?: number;
};

type _Insert<Table> = Table;

type _Where<Table extends TableExtends> =
  | (Partial<Table> & {
      LIKE?: undefined;
      OR?: undefined;
    })
  | (_WhereOR<Table> & {
      LIKE?: undefined;
    })
  | (_WhereLike<Table> & { OR?: undefined });

type _WhereWOLike<Table extends TableExtends> =
  | Partial<Table>
  | _WhereORWOLike<Table>;
type _WhereORWOLike<Table extends TableExtends> = {
  OR: Partial<Table>[];
};

type FilterStringValues<T extends TableExtends> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

type FilteredObject<T extends TableExtends> = {
  [K in FilterStringValues<T>]: T[K];
};

type _WhereLike<Table extends TableExtends> =
  | {
      /**
       * like operator use wild card
       *  - **_** <-- single char
       *  - **%** <-- multiple char
       * @link https://www.sqlitetutorial.net/sqlite-like
       * @example
       * db.select({ where: { LIKE: { foo: "lo_" }  } }) // ["lor"]
       * @example
       * db.select({ where: { LIKE: { foo: "lo%" }  } }) // ["lor","lorem ipsum", "lorem ipsum dolor"]
       */
      LIKE: Partial<FilteredObject<Table>>;
    } & { [K in Exclude<ReservedKeyWords, "LIKE">]?: undefined };

type _WhereOR<Table extends TableExtends> = {
  OR: Partial<Table | _WhereLike<Table>>[];
};

type _Update<Table extends TableExtends> = {
  where?: _WhereWOLike<Table>;
  values: Partial<Table>;
};

type _Delete<Table extends TableExtends> = {
  where: _WhereWOLike<Table>;
};

type _Count<Table extends TableExtends> = {
  where?: _WhereWOLike<Table>;
};

type _Create = TableSchema;

type _FormatString<
  T extends TableExtends,
  SELECT_FORMAT extends TableExtends
> = _Select<SELECT_FORMAT> | _Update<T> | _Delete<T> | _Count<T>;

export class Table<
  T extends Omit<TableSchema, "name" | "columns">,
  SELECT_FORMAT extends Omit<TableSchema, "name" | "columns">
> {
  private name: string;
  private debug: boolean;
  /**
   * direct access to the database instance
   * @link https://bun.sh/docs/api/sqlite
   */
  databaseInstance: _BunDB;
  shema: DBSchema;
  constructor({
    name,
    db,
    shema,
    debug,
    WAL = true,
  }: {
    name: string;
    db?: _BunDB;
    shema?: DBSchema;
    debug?: boolean;
    WAL?: boolean;
  }) {
    this.name = name;
    this.databaseInstance = db || MainDatabase;
    this.shema = shema || globalThis.dbShema;
    this.debug = debug || false;
    if (WAL && db) this.databaseInstance.exec("PRAGMA journal_mode = WAL;");
  }
  private extractParams(
    key: keyof _Where<T> | ReservedKeyWords,
    where?: Partial<_Where<T>> & Partial<Record<ReservedKeyWords, any>>
  ) {
    if (!where) return [];
    this.Log(() => console.log({ key, where }));
    return Array.prototype
      .concat(
        ...(where[key] as Array<Partial<T>>).map((data) => Object.values(data))
      )
      .filter((e) => e != undefined) as string[];
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
            try {
              return {
                [key]: JSON.parse(params[key]),
              };
            } catch {
              return {
                [key]: params[key],
              };
            }
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
  private hasLIKE(data: _FormatString<T, SELECT_FORMAT>) {
    return data.where && Object.keys(data.where).find((e) => e == "LIKE")
      ? true
      : false;
  }
  private extractLikeOrParams(
    data: _FormatString<T, SELECT_FORMAT> & {
      where?: Partial<Record<ReservedKeyWords, any>>;
    }
  ): string[] {
    const ReservedArray: Array<ReservedKeyWords> = ["LIKE"];

    if (!data.where) return [];

    if (!this.hasOR(data)) {
      for (const param of ReservedArray as Array<ReservedKeyWords>) {
        if (data.where[param])
          return (
            Object.values(data.where[param]) as Array<string | undefined>
          ).filter((e) => e != undefined);
      }
      return Object.values(data.where).filter((e) => e != undefined);
    } else {
      const datas = (data.where?.OR as _WhereOR<T>["OR"])
        .map((entry) => {
          return (Object.keys(entry) as Array<keyof _WhereLike<T>>).map((k) => {
            if (ReservedArray.includes(k))
              return Object.values(entry[k as keyof typeof entry] || {});
            return [entry[k as keyof typeof entry]];
          });
        })
        .reduce((p, n) => [...p, ...n], [])
        .reduce((p, n) => [...p, ...n], []) as string[];

      this.Log(() => console.log({ whereOR: data.where?.OR, datas }));
      return datas;
    }
  }
  private formatQueryString(data: _FormatString<T, SELECT_FORMAT>) {
    let queyString = "";

    const hasOR = this.hasOR(data);
    const hasLIKE = this.hasLIKE(data);

    const whereKeys = () =>
      (
        Object.keys(data.where || {}) as Array<keyof _Select<T>["where"]>
      ).filter(
        (k) => (data.where as _Where<T>)[k as keyof _Where<T>] != undefined
      ) as Array<string>;

    const toLIKE = (keys: Array<string>) =>
      ` ${keys.map((k) => `${k} LIKE ?`).join(" AND ")}`;

    if (data.where && !hasOR && !hasLIKE) {
      queyString +=
        "WHERE " +
        whereKeys()
          .map((where) => {
            return `${where} = ?`;
          })
          .join(" AND ");
    } else if (data.where && hasOR) {
      const ORlist = (data.where as _WhereOR<T>).OR;

      queyString +=
        "WHERE " +
        ORlist.map((or) => {
          return (Object.keys(or) as Array<keyof T & keyof _WhereLike<T>>)
            .map((key) => {
              if (key == "LIKE")
                return toLIKE(
                  Object.keys(
                    (or as _WhereLike<T>).LIKE as Partial<FilteredObject<T>>
                  )
                );
              else return `${key} = ?`;
            })
            .join(" AND ");
        }).join(" OR ");
    } else if (data.where && hasLIKE) {
      queyString += `WHERE ${toLIKE(
        Object.keys((data.where as unknown as _WhereLike<T>).LIKE || {})
      )}`;
    }

    this.Log(() => console.log({ data, queyString }));

    return queyString;
  }
  private Log(callback: Function) {
    this.debug && callback();
  }
  private errorWrapper<T>(callback: () => T): T {
    try {
      return callback();
    } catch (e) {
      const err = e as Error;
      if (err.name == "SQLiteError" && err.message == "database is locked") {
        return this.errorWrapper(callback);
      } else throw e;
    }
  }

  select(data: _Select<SELECT_FORMAT>) {
    if (
      this.hasOR(data) &&
      data.where &&
      (data.where as _WhereOR<SELECT_FORMAT>).OR?.length == 0
    )
      return [];

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

    this.Log(() => console.log({ full_queryString: queyString }));

    return this.errorWrapper(() => {
      const query = this.databaseInstance.prepare(queyString);
      const res = query.all(...this.extractLikeOrParams(data));
      query.finalize();
      return res;
    }).map((row) => this.restoreParams(row)) as Partial<SELECT_FORMAT>[];
  }
  insert(data: _Insert<T>[]) {
    let queryString = `INSERT INTO ${this.name} (${Object.keys(
      (data as any)[0]
    ).join(", ")}) VALUES (${Object.keys((data as any)[0]).map(
      (v) => `$${v}`
    )})`;
    let entries: any[] = [];

    return this.errorWrapper(() => {
      const db = this.databaseInstance.prepare(queryString);
      const inserter = this.databaseInstance.transaction((entries) => {
        for (const entry of entries) db.run(entry);
      });
      if (entries.length == 0)
        entries = data.map((entry) =>
          Object.assign(
            {},
            ...Object.keys(entry as any).map((e) => {
              return {
                [`$${e}`]: this.parseParams([(entry as any)[e]])[0],
              };
            })
          )
        );
      const res = inserter(entries) as void;
      db.finalize();
      return res;
    });
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

    return this.errorWrapper(() => {
      const db = this.databaseInstance.prepare(queryString);
      const res = db.all(...this.parseParams(params)) as T[];
      db.finalize();
      return res;
    });
  }
  delete(data: _Delete<T>) {
    if (
      this.hasOR(data) &&
      data.where &&
      (data.where as _WhereOR<T>).OR.length == 0
    )
      return;

    const queyString = `DELETE FROM ${this.name} ${this.formatQueryString(
      data
    )}`;
    return this.errorWrapper(() => {
      const query = this.databaseInstance.prepare(queyString);
      const res = query.all(...this.extractLikeOrParams(data));
      query.finalize();
      return res;
    }) as unknown as void;
  }
  count(data?: _Count<T>) {
    if (
      data &&
      this.hasOR(data) &&
      data.where &&
      (data.where as _WhereOR<T>).OR.length == 0
    )
      return 0;

    const queryString = `SELECT COUNT(*) FROM ${this.name} ${
      data ? this.formatQueryString(data) : ""
    }`;

    const res = this.errorWrapper(() => {
      const query = this.databaseInstance.prepare(queryString);
      const res = query.all(...(data ? this.extractLikeOrParams(data) : []));
      query.finalize();
      return res;
    });

    return (res as Array<{ "COUNT(*)": number }>)[0]["COUNT(*)"];
  }
}

export const wild = {
  single: "_",
  multiple: "%",
} as const;
