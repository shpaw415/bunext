import Database from "bun:sqlite";
import { _Database, Table } from "../../database/class";
import type { revalidate, ssrElement } from "../../internal/types";
import type { DBSchema } from "../../database/schema";
import { type _Head } from "../../features/head";

const dbSchema: DBSchema = [
  {
    name: "ssr",
    columns: [
      {
        name: "path",
        type: "string",
        primary: true,
      },
      {
        name: "elements",
        type: "json",
        DataType: [
          {
            tag: "string",
            reactElement: "string",
            htmlElement: "string",
          },
        ],
      },
    ],
  },
  {
    name: "revalidate",
    columns: [
      {
        name: "path",
        type: "string",
        primary: true,
      },
      {
        name: "time",
        type: "number",
      },
    ],
  },
  {
    name: "head",
    columns: [
      {
        name: "path",
        type: "string",
      },
      {
        name: "title",
        type: "string",
        nullable: true,
      },
      {
        name: "author",
        type: "string",
        nullable: true,
      },
      {
        name: "publisher",
        type: "string",
        nullable: true,
      },
      {
        name: "meta",
        type: "json",
        DataType: [],
      },
      {
        name: "link",
        type: "json",
        DataType: [],
      },
    ],
  },
];

class CacheManager {
  private db: _Database = new _Database(
    new Database(import.meta.dirname + "/cache.sqlite", {
      create: true,
      readwrite: true,
    })
  );

  private ssr = new Table<ssrElement, ssrElement>({
    db: this.db.databaseInstance,
    name: "ssr",
    shema: dbSchema,
  });
  private revalidate = new Table<revalidate, revalidate>({
    db: this.db.databaseInstance,
    name: "revalidate",
    shema: dbSchema,
  });
  private head = new Table<_Head, _Head>({
    db: this.db.databaseInstance,
    name: "head",
    shema: dbSchema,
  });

  private page = new Table<ssrElement, ssrElement>({
    db: this.db.databaseInstance,
    name: "page",
    shema: dbSchema,
  });

  constructor() {
    for (const tab of dbSchema) this.db.create(tab);
  }
  addSSR(path: string, elements: ssrElement["elements"]) {
    if (!Boolean(this.ssr.select({ where: { path } }).at(0))) {
      this.ssr.insert([
        {
          path,
          elements,
        },
      ]);
    } else this.ssr.update({ where: { path }, values: { elements } });

    return {
      path,
      elements,
    } as ssrElement;
  }
  getSSR(path: string) {
    return this.ssr.select({ where: { path } }).at(0) as ssrElement | undefined;
  }
  getAllSSR() {
    return this.ssr.select({}) as ssrElement[];
  }
  deleteSSR(path: string) {
    this.ssr.delete({ where: { path } });
  }
  clearSSR() {
    this.ssr.databaseInstance.run("DELETE FROM ssr");
  }
}

const CacheManage = new CacheManager();

export default CacheManage;
