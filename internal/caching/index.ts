import Database from "bun:sqlite";
import { _Database, Table } from "../../database/class";
import type { revalidate, ssrElement, staticPage } from "../../internal/types";
import type { DBSchema, TableSchema } from "../../database/schema";
import { type _Head } from "../../features/head";
import { generateRandomString } from "../../features/utils";

declare global {
  //@ts-ignore
  var CacheManage: CacheManager;
}

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
  {
    name: "static_page",
    columns: [
      {
        name: "id",
        type: "string",
        primary: true,
        unique: true,
      },
      {
        name: "pathname",
        type: "string",
        unique: true,
      },
      {
        name: "page",
        type: "string",
      },
      {
        name: "props",
        type: "string",
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
  private ssr = this.CreateTable<ssrElement, ssrElement>("ssr");
  private revalidate = this.CreateTable<revalidate, revalidate>("revalidate");
  private head = this.CreateTable<_Head, _Head>("head");
  private page = this.CreateTable<ssrElement, ssrElement>("page");
  private static_page = this.CreateTable<staticPage, staticPage>("static_page");

  private CreateTable<T1 extends {}, T2 extends {}>(name: string) {
    return new Table<T1, T2>({
      db: this.db.databaseInstance,
      name: name,
      shema: dbSchema,
      WAL: true,
    });
  }

  constructor() {
    for (const tab of dbSchema) this.db.create(tab);
  }
  addSSR(path: string, elements: ssrElement["elements"]) {
    const doUpdate = () =>
      this.ssr.update({ where: { path }, values: { elements } });

    if (!Boolean(this.ssr.select({ where: { path } }).at(0))) {
      try {
        this.ssr.insert([
          {
            path,
            elements,
          },
        ]);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code == "SQLITE_CONSTRAINT_PRIMARYKEY") doUpdate();
        else throw err;
      }
    } else doUpdate();

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

  addStaticPage(url: string, page: string, props: string) {
    const _url = new URL(url);
    this.static_page.insert([
      {
        id: generateRandomString(32),
        pathname: _url.pathname,
        page,
        props,
      },
    ]);
  }
  getStaticPage(url: string) {
    const _url = new URL(url);
    return (this.static_page
      .select({
        where: {
          pathname: _url.pathname,
        },
        select: {
          page: true,
          props: true,
        },
      })
      .at(0) ?? undefined) as staticPage | undefined;
  }
  getStaticPageProps(url: string) {
    const _url = new URL(url);
    return (
      (this.static_page
        .select({
          where: {
            pathname: _url.pathname,
          },
          select: {
            props: true,
          },
        })
        .at(0) ?? undefined) as staticPage | undefined
    )?.props;
  }
  removeStaticPage(pathname: string) {
    this.static_page.delete({
      where: {
        pathname,
      },
    });
  }
  clearStaticPage() {
    this.ssr.databaseInstance.run("DELETE FROM static_page");
  }
}
//@ts-ignore
globalThis.CacheManage ??= new CacheManager();

export default globalThis.CacheManage;
export { CacheManager };
