import { normalize } from "node:path";

export class PluginLoader {
  async PluginLoader<T>(path: string) {
    const plugins_files_paths = Array.from(
      new Bun.Glob("**/*.ts").scanSync({
        cwd: normalize(`${import.meta.dirname}/../../plugins/${path}`),
        onlyFiles: true,
        absolute: true,
      })
    );

    return (
      await Promise.all(
        plugins_files_paths.map(
          async (path) => (await import(path)).default as T
        )
      )
    ).filter((f) => f != undefined);
  }
}
