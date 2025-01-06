import Database from "bun:sqlite";
import { _Database, Table } from "../../database/class";
import { transform } from "@svgr/core";

export type cacheType = {
  path: string;
  data: string;
  hash: number;
};

const table = new Table<cacheType, cacheType>({
  name: "svg_cache",
  db: new Database(import.meta.dirname + "/svg.sqlite", {
    readwrite: true,
    create: true,
  }),
});

async function get(path: string) {
  const svgText = await Bun.file(path).text();
  const currentHash = dataToHash(svgText);
  const cached = getCached(path);
  if (currentHash == cached?.hash) return cached.data;
  const convertedSvg = convert(svgText);
  addToCache(path, convertedSvg);
  return convertedSvg;
}

function convert(svg: string) {
  return transform.sync(
    svg,
    {
      icon: true,
      plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
      jsxRuntime: "automatic",
    },
    {
      componentName: "SVG",
    }
  );
}

function getCached(path: string) {
  return table
    .select({ where: { path }, select: { data: true, hash: true } })
    .at(0) as Omit<cacheType, "path"> | undefined;
}

function dataToHash(data: string) {
  return Number(Bun.hash(data));
}

function addToCache(path: string, data: string) {
  if (table.select({ where: { path } }).at(0)) {
    table.update({
      where: { path },
      values: { data, hash: dataToHash(data) },
    });
  } else
    table.insert([
      {
        data,
        path,
        hash: dataToHash(data),
      },
    ]);
}

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
      {
        name: "hash",
        type: "number",
      },
    ],
  });
  db.databaseInstance.run("DELETE FROM svg_cache;");
}

if (import.meta.main) {
  clearCache();
}

export { table, get };
