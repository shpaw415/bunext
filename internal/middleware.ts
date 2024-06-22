//server only
import { webToken } from "@bunpmjs/json-webtoken";
import {
  __SET_CURRENT__,
  Session as _Session,
  __USER_ACTION__,
  type _SessionData,
} from "../features/session";

import { __SET_REQUEST__ } from "../features/request";

type _MiddleWareOptions = {
  sessionTimeout?: number;
};

export let Session: middleWare;

export function setMiddleWare(req: Request, options: _MiddleWareOptions) {
  Session = new middleWare({
    req,
  });
}

class middleWare {
  public _session: webToken<any>;
  public request: Request;
  private sessionTimeout = 3600;

  constructor({ req }: { req: Request }) {
    this.request = req;
    this._session = new webToken<unknown>(req, {
      cookieName: "bunext_session_token",
    });
    try {
      __SET_CURRENT__(this.getData() || { private: {}, public: {} });
    } catch {
      _Session.delete();
    }
    __SET_REQUEST__({ req });
  }

  setData(data: { private: Record<string, any>; public: Record<string, any> }) {
    __USER_ACTION__.__SESSION_DATA__ = data;
  }

  setToken(response: Response) {
    if (__USER_ACTION__.__SESSION_DATA__) {
      this._session.setData({
        ...__USER_ACTION__.__SESSION_DATA__,
        __bunext_session_created_at__: new Date().getTime() / 1000,
      });
      return this._session.setCookie(response, {
        expire: this.sessionTimeout,
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

  IsExpired() {
    const data = this.getData();
    const createdAt = data?.private.__bunext_session_created_at__ as
      | number
      | undefined;
    const CurrentTimeInSecond = new Date().getTime() / 1000;
    if (
      !data ||
      !createdAt ||
      CurrentTimeInSecond - createdAt > this.sessionTimeout
    )
      return true;
    return false;
  }

  getData<_Data>() {
    if (this.IsExpired()) return undefined;
    return this._session.session() as _SessionData<_Data> | undefined;
  }
}
