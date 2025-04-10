declare global {
  var __FETCH_BUNEXT__: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
}

export class BunextFetchCaching {
  private cached: Array<{
    response: Response;
    hash: string;
  }> = [];

  constructor() {
    if (typeof window != "undefined") return;
    globalThis.__FETCH_BUNEXT__ ??= fetch;
    //@ts-ignore
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.fetch(input, init);
    };
  }
  private getTimeout(init?: RequestInit) {
    const defaultTimout = 3600;

    if (!init?.headers || !(init as any).headers?.["cache-revalidate"])
      return defaultTimout;
    return parseInt((init as any).headers["cache-revalidate"]);
  }
  private async fetch(input: RequestInfo | URL, init: RequestInit = {}) {
    if (init?.cache == "no-store")
      return await globalThis.__FETCH_BUNEXT__(input, init);
    const result = await this.compare(input, init);
    if (result) return result.response.clone();
    const response = await globalThis.__FETCH_BUNEXT__(input, init);

    const hash = await this.generateCacheKey(input, init);
    this.cached.push({
      hash,
      response,
    });
    setTimeout(() => {
      const index = this.cached.findIndex((e) => e.hash == hash);
      if (index == -1) return;
      this.cached.splice(index, 1);
    }, this.getTimeout(init) * 1000);

    return response.clone();
  }

  async generateCacheKey(url: RequestInfo | URL, options: RequestInit) {
    const { method = "GET", headers = {}, body } = options;

    // Normalisation des headers (exclure les valeurs dynamiques comme `Authorization`)
    const sortedHeaders = Object.entries(headers as HeadersInit)
      .filter(
        ([key]) => !["authorization", "cookie"].includes(key.toLowerCase())
      )
      .sort(([a], [b]) => a.localeCompare(b));

    const resolvedUrl =
      url instanceof Request
        ? url.url
        : url instanceof URL
        ? url.toString()
        : url;

    // Création d'une signature unique
    const keyData = JSON.stringify({
      url: resolvedUrl,
      method,
      headers: sortedHeaders,
      body,
    });

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(keyData)
    );
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async compare(input: RequestInfo | URL, init: RequestInit = {}) {
    const currentHash = await this.generateCacheKey(input, init);
    return this.cached.find(({ hash }) => currentHash == hash);
  }
  public reset() {
    this.cached = [];
  }
}

const fetchCaching = new BunextFetchCaching();

export default fetchCaching;
