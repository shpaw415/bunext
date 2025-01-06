import Database from "bun:sqlite";
import { _Database, Table } from "../../database/class";

export type cacheType = {
  path: string;
  data: string;
};

const table = new Table<cacheType, cacheType>({
  name: "svg_cache",
  db: new Database(import.meta.dirname + "/svg.sqlite", {
    readwrite: true,
  }),
});

function clearCache() {
  const db = new _Database(table.databaseInstance);
  db.create({
    name: "svg_cache",
    columns: [
      {
        name: "path",
        primary: true,
        type: "string",
      },
      {
        name: "data",
        type: "string",
      },
    ],
  });
  db.databaseInstance.run("DELETE FROM svg_cache;");
}

if (import.meta.main) {
  clearCache();
}

export { table, clearCache };
