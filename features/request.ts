export const __REQUEST_CONTEXT__ = {
  request: undefined as undefined | Request,
  response: undefined as undefined | Response,
};

export function __SET_REQUEST__({ req }: { req: Request }) {
  __REQUEST_CONTEXT__.request = req;
  __REQUEST_CONTEXT__.response = new Response();
}

interface _Cookie {
  name: string;
  value: string | Record<string, any>;
  httpOnly?: true;
  secure?: true;
  expireDay: number | -1;
  path?: string;
}

const isClient = typeof window != "undefined";

class _Response {
  constructor() {
    if (isClient)
      throw new Error("You cannot use Response in a Client context");
  }
  setCookie({ name, value, httpOnly, secure, expireDay, path }: _Cookie) {
    let date = new Date();
    date.setTime(date.getTime() + expireDay * 24 * 60 * 60 * 1000);
    const cookieHeader: string[] = [
      `${name}=${typeof value == "string" ? value : JSON.stringify(value)};`,
      `expires=${date.toUTCString()};`,
      `path=${path ? path : "/"}`,
      secure ? "Secure;" : "",
      httpOnly ? "HttpOnly" : "",
    ].filter((v) => v.length > 0);
    __REQUEST_CONTEXT__.request?.headers.append(
      "Set-Cookie",
      cookieHeader.join(" ")
    );
  }
}

class _Request {
  Request = __REQUEST_CONTEXT__.request as Request;

  constructor() {
    if (isClient) throw new Error("You cannot use Request in a Client context");
  }
  getCookie(name: string) {
    let nameEQ = name + "=";
    let ca = this.Request.headers.get("Cookie")?.split(";");
    if (!ca) return null;
    for (let i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }
}

export { _Request as Request, _Response as Response };
