declare global {
  var __FETCH_BUNEXT__: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
}

export class BunextFetchCaching {
  private cached: Array<{
    input: RequestInfo | URL;
    init?: RequestInit;
    result: Response;
  }> = [];

  constructor() {
    globalThis.__FETCH_BUNEXT__ ??= fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return this.fetch(input, init);
    };
  }

  private async fetch(input: RequestInfo | URL, init?: RequestInit) {
    const result = this.compare(input, init);
    if (result) {
      console.log("old fetch");
      return result;
    }
    const response = await globalThis.__FETCH_BUNEXT__(input, init);
    this.pushToCache({
      response,
      input,
      init,
    });
    console.log("new fetch");
    return response;
  }

  private pushToCache(props: {
    response: Response;
    input: RequestInfo | URL;
    init?: RequestInit;
  }) {
    this.cached.push({
      result: props.response,
      input: props.input,
      init: props.init,
    });
  }

  private compare(input: RequestInfo | URL, init?: RequestInit) {
    for (const cached of this.cached) {
      if (
        Bun.deepEquals(input, cached.input) &&
        Bun.deepEquals(init, cached.init)
      ) {
        return cached.result;
      }
    }
    return null;
  }
  public reset() {
    this.cached = [];
  }
}

const fetchCaching = new BunextFetchCaching();

export { fetchCaching };
