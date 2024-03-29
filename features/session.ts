export interface _SessionData<_SessionData> {
  public: Record<string, _SessionData>;
  private: Record<string, _SessionData>;
}

export const __USER_ACTION__ = {
  __DELETE__: false,
  __SESSION_DATA__: undefined as undefined | _SessionData<any>,
};

/**
 * __PUBLIC_SESSION_DATA__ is set in middleware
 */
declare global {
  var __PUBLIC_SESSION_DATA__: Record<string, any> | undefined;
}

export function __SET_CURRENT__(data: _SessionData<any>) {
  __USER_ACTION__.__SESSION_DATA__ = data;
}
export function __GET_PUBLIC_SESSION_DATA__() {
  return __USER_ACTION__.__SESSION_DATA__?.public;
}

class _Session {
  private cookieName = "bunext_session_token";
  private publicSessionData = globalThis.__PUBLIC_SESSION_DATA__;
  /**
   * Server side only
   * @param data data to set in the token
   * @param Public the data can be accessed in the client context
   * @description update the data in the session. Current data will be keept
   */
  setData(data: Record<string, any>, Public?: true) {
    this.PublicThrow("Session.setData cannot be called in a client context");
    if (typeof __USER_ACTION__.__SESSION_DATA__?.private == "undefined") return;
    __USER_ACTION__.__SESSION_DATA__.private = {
      ...__USER_ACTION__.__SESSION_DATA__?.private,
      ...data,
    };

    if (
      typeof __USER_ACTION__.__SESSION_DATA__?.public == "undefined" ||
      !Public
    )
      return;
    __USER_ACTION__.__SESSION_DATA__.public = {
      ...__USER_ACTION__.__SESSION_DATA__.public,
      ...data,
    };
  }
  /**
   * Server side only
   * @description Reset session data.
   */
  reset() {
    this.PublicThrow("Session.reset cannot be called in a client context");
    __USER_ACTION__.__SESSION_DATA__ = {
      public: {},
      private: {},
    };
    return this;
  }
  /**
   * Server & Client
   * @returns the current data
   * @example
   * "use server";
   * Session.setData({data: "someData"}, true); // true for public access
   * // other file
   * "use client";
   * Session.getData(); // {data: "someData"} | undefined
   */
  getData(): undefined | Record<string, any> {
    if (typeof window != "undefined") return this.publicSessionData;
    return __USER_ACTION__.__SESSION_DATA__?.private;
  }
  /**
   * Server & Client
   * @description delete Session
   */
  delete() {
    if (this.isClient()) this.deleteClientSession();
    else __USER_ACTION__.__DELETE__ = true;
  }
  /**
   * Error if client side
   * @param error to be logged
   */
  private PublicThrow(error: string) {
    if (typeof window != "undefined") throw new Error(error);
  }
  private isClient() {
    return typeof window != "undefined";
  }
  private deleteClientSession() {
    document.cookie =
      this.cookieName + "=; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    globalThis.__PUBLIC_SESSION_DATA__ = undefined;
  }
}

export let Session = new _Session();
