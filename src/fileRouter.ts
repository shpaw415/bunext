export const _fileRouter = new Bun.FileSystemRouter({
  dir: process.cwd() + "/src/pages",
  style: "nextjs",
});

class AssetsFileRouter {
  private assetsRoute: string;
  private path: string | undefined;

  constructor({ assetsPath }: { assetsPath: string }) {
    this.assetsRoute = assetsPath.endsWith("/") ? assetsPath : `${assetsPath}/`;
  }

  async match(path: string) {
    const _path = path.startsWith("/") ? path.replace("/", "") : path;
    const filePath = `${this.assetsRoute}${this.sanitize(_path)}`;
    const file = Bun.file(filePath);
    this.path = filePath;
    return await file.exists();
  }
  getPath() {
    return this.path as string;
  }
  private sanitize(path: string) {
    const forbiden = ["../"];
    if (path.indexOf("\0") !== -1) {
      throw new Error("null byte detected");
    }
    for (const i of forbiden) {
      if (!path.includes(i)) continue;
      throw new Error("forbiden Char");
    }
    return path;
  }
}

export const _assetFileRouter = new AssetsFileRouter({
  assetsPath: "./static",
});
