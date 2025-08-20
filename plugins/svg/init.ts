import Database from "bun:sqlite";
import { _Database, Table } from "../../database/class";
import { transform } from "@svgr/core";
import { CacheManagerPool } from "internal/caching";

export type cacheType = {
  path: string;
  data: string;
  hash: number;
};


class SVGCacheManager extends CacheManagerPool {
  constructor() {
    super({
      dbPath: import.meta.dirname + "/svg.sqlite",
      schema: [
        {
          name: "svg_cache",
          columns: [
            {
              name: "path",
              type: "string",
              primary: true,
              unique: true,
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
        },
      ],
    });
  }

  private svg_cache<T>(then: (table: Table<cacheType, cacheType>) => T) {
    return this.getTable<cacheType, cacheType>("svg_cache", then) as Promise<T>;
  }

  async get(path: string) {
    const svgText = await Bun.file(path).text();
    const currentHash = this.dataToHash(svgText);
    const cached = await this.getCached(path);
    if (currentHash == cached?.hash) return cached.data;
    const convertedSvg = this.convert(svgText);
    this.addToCache(path, convertedSvg);
    return convertedSvg;
  }

  async addToCache(path: string, data: string) {
    return this.svg_cache((table) =>
      table.upsert([{
        path, data, hash: this.dataToHash(data)
      }], ["path"])
    );
  }
  private convert(svg: string) {
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
  async getCached(path: string) {
    return (await this.svg_cache((t) => t.select({
      where: { path },
      select: { data: true, hash: true },
    }))).at(0) as Omit<cacheType, "path"> | undefined;
  }
  dataToHash(data: string) {
    return Number(Bun.hash(data));
  }
  clearCache() {
    return this.svg_cache(t => t.databaseInstance.run("DELETE FROM svg_cache;"));
  }
}

const SVGCache = new SVGCacheManager();

if (import.meta.main) {
  SVGCache.clearCache();
}

export { SVGCache };
