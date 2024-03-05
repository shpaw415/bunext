import { webToken } from "@bunpmjs/json-webtoken";

let test = 0;

console.log(test);

test++;

export class middleWare {
  public _session: webToken<any>;
  public _sessionData?: { [key: string]: any };
  public _deleteSesion = false;
  public request: Request;

  constructor({ req }: { req: Request }) {
    this.request = req;
    this._session = new webToken<unknown>(req, {
      cookieName: "bunext_session_token",
    });
  }

  setSessionData(data: { [key: string]: any }) {
    this._sessionData = data;
  }

  setSessionToken(response: Response) {
    if (this._sessionData) {
      return this._session.setCookie(response, {
        expire: 3600,
        httpOnly: true,
        secure: false,
      });
    } else if (this._deleteSesion) {
      return this._session.setCookie(response, {
        expire: -10000,
        httpOnly: true,
        secure: false,
      });
    }
    return response;
  }

  getSessionData<_Data>() {
    return this._session.session() as _Data | undefined;
  }
}
