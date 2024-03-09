import { webToken } from "@bunpmjs/json-webtoken";
import {
  __SET_CURRENT__,
  Session as _Session,
  __USER_ACTION__,
} from "../features/session";

export let Session: middleWare;

export function setMiddleWare(req: Request) {
  Session = new middleWare({
    req,
  });
}

class middleWare {
  public _session: webToken<any>;
  public request: Request;

  constructor({ req }: { req: Request }) {
    this.request = req;
    this._session = new webToken<unknown>(req, {
      cookieName: "bunext_session_token",
    });
    try {
      __SET_CURRENT__(this.getData());
    } catch {
      _Session.delete();
    }
  }

  setData(data: { [key: string]: any }) {
    __USER_ACTION__.__CURRENT_DATA__ = data;
  }

  setToken(response: Response) {
    if (__USER_ACTION__.__SESSION_DATA__) {
      this._session.setData(__USER_ACTION__.__SESSION_DATA__);
      return this._session.setCookie(response, {
        expire: 3600,
        httpOnly: true,
        secure: false,
      });
    } else if (__USER_ACTION__.__DELETE__) {
      this._session.setData({});
      return this._session.setCookie(response, {
        expire: -10000,
        httpOnly: true,
        secure: false,
      });
    }
    return response;
  }

  getData<_Data>() {
    return this._session.session() as _Data | undefined;
  }
}
