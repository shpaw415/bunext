export const __USER_ACTION__ = {
  __DELETE__: false,
  __CURRENT_DATA__: undefined as undefined | any,
  __SESSION_DATA__: undefined as Record<string, any> | undefined,
  __PUBLIC_SESSION_DATA__: undefined as Record<string, any> | undefined,
};

/**
 * __PUBLIC_SESSION_DATA__ is set in middleware
 */
declare global {
  var __PUBLIC_SESSION_DATA__: Record<string, any> | undefined;
}

export function __SET_CURRENT__(data: any) {
  __USER_ACTION__.__CURRENT_DATA__ = data;
}
export function __GET_PUBLIC_SESSION_DATA__() {
  return __USER_ACTION__.__PUBLIC_SESSION_DATA__;
}

class _Session {
  private publicSessionData = globalThis.__PUBLIC_SESSION_DATA__;
  /**
   *
   * @param data data to set in the token
   * @param Public the data can be accessed in the client context
   */
  setData(data: Record<string, any>, Public?: true) {
    if (typeof window != "undefined")
      throw new Error("Session.setData cannot be called in a client context");
    __USER_ACTION__.__SESSION_DATA__ = data;
    if (Public) __USER_ACTION__.__PUBLIC_SESSION_DATA__ = data;
  }
  getData(): undefined | Record<string, any> {
    if (typeof window != "undefined") return this.publicSessionData;
    return __USER_ACTION__.__CURRENT_DATA__;
  }
  delete() {
    __USER_ACTION__.__DELETE__ = true;
  }
}

export let Session = new _Session();
