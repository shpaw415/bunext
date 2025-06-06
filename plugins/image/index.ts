import sharp from "sharp";
import type { BunextRequest } from "../../internal/server/bunextRequest";
import type { BunextPlugin } from "../types";
import { join, normalize } from "path";
import { mkdirSync } from "fs";
import { CacheManagerExtends } from "../../internal/caching";
import type { blurredImage } from "./type";

declare global {
  var blurImages: blurredImage[];
}
globalThis.blurImages ??= [];

const cwd = process.cwd();

class BlurredImageCache extends CacheManagerExtends {
  blurredCache = this.CreateTable<blurredImage, blurredImage>("blured_image");
  cachedBlurredImages: Array<{ path: string; img_path: string }> = [];
  constructor() {
    super({
      shema: [
        {
          name: "blured_image",
          columns: [
            {
              name: "id",
              type: "number",
              autoIncrement: true,
              primary: true,
            },
            {
              name: "path",
              type: "string",
            },
            { name: "img_path", type: "string" },
            {
              name: "encoded",
              type: "string",
            },
          ],
        },
      ],
      dbPath: join(import.meta.dirname, "image_cache.sqlite"),
    });
  }

  clear() {
    this.blurredCache.databaseInstance.query("DELETE from blured_image").all();
  }

  get(path: string) {
    const res = this.blurredCache.select({
      where: { path },
      select: { encoded: true, img_path: true },
    });

    return res;
  }
  private getSpecific(data: { path: string; img_path: string }) {
    return this.blurredCache
      .select({
        where: data,
        select: { encoded: true },
      })
      .at(0)?.encoded;
  }
  async add(path: string, img_path: string) {
    const resolvedImgPath = img_path.replace(join(cwd, "static"), "");
    if (
      this.cachedBlurredImages.find(
        (data) => data.path == path && data.img_path == img_path
      )
    )
      return this.getSpecific({ path, img_path: resolvedImgPath });
    const buffer = await sharp(img_path)
      .resize(10) // largeur de 10px, hauteur proportionnelle
      .jpeg({ quality: 30 }) // compression forte
      .toBuffer();
    const newEl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    this.cachedBlurredImages.push({ path, img_path });
    this.blurredCache.insert([
      {
        encoded: newEl,
        img_path: resolvedImgPath,
        path,
      },
    ]);

    return newEl;
  }
}

export const cache = new BlurredImageCache();

async function transformImage(req: BunextRequest) {
  const url = req.URL;
  const src = url.searchParams.get("src");
  const w = parseInt(url.searchParams.get("w") || "0");
  const h = parseInt(url.searchParams.get("h") || "0");
  const q = parseInt(url.searchParams.get("q") || "75");

  if (
    !src ||
    isNaN(w) ||
    isNaN(h) ||
    src.includes("..") ||
    src.includes("~") ||
    !src.startsWith("/")
  ) {
    return new Response("Invalid params", { status: 400 });
  }

  try {
    const imagePath = join(process.cwd(), "static", normalize("/" + src));
    const fileBuffer = await Bun.file(imagePath).arrayBuffer();

    const filePath = join(
      process.cwd(),
      ".bunext",
      "image",
      Bun.hash(req.URL.href).toString() + ".webp"
    );

    if (!(await Bun.file(filePath).exists())) {
      await sharp(fileBuffer)
        .resize(w, h)
        .toFormat("webp", { quality: q })
        .toFile(filePath);
    }

    return new Response(Bun.file(filePath), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("Image optimization error:", err);
    return new Response("Image processing error", { status: 500 });
  }
}

export default {
  router: {
    request: async (req) => {
      if (req.URL.pathname == "/bunext/image") {
        req.__SET_RESPONSE__(await transformImage(req));
        return req;
      }
    },

    html_rewrite: {
      rewrite(reWriter, bunextRequest) {
        reWriter.on("img", {
          async element(el) {
            const src = el.getAttribute("data-bunext-img-src");
            if (!src) return;
            const base64Data = await cache.add(
              bunextRequest.URL.pathname,
              join(cwd, "static", src)
            );
            el.setAttribute("src", base64Data || "");
          },
        });
        reWriter.onDocument({
          end(end) {
            const encodedData = cache.get(bunextRequest.URL.pathname);

            const safeJsonString = JSON.stringify(encodedData)
              .replace(/`/g, "\\`")
              .replace(/<\/script>/gi, "<\\/script>");

            end.append(
              `<script> globalThis.blurImages = JSON.parse(\`${safeJsonString}\`); </script>`,
              {
                html: true,
              }
            );
          },
        });
      },
    },
  },
  serverStart: {
    main() {
      mkdirSync(".bunext/image", {
        recursive: true,
      });
    },
    dev() {
      cache.clear();
    },
  },
} as BunextPlugin;
