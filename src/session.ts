/**
 * Represents a session object.
 */
class _session {
  /**
   * Sets session data.
   * @param prop.data - The session data to be set.
   * @param prop.options - The options for the session.
   * @param prop.options.expire - The expiration time for the session in milliseconds.
   * @param prop.options.httpOnly - Specifies whether the session cookie should be accessible only through HTTP(S) requests.
   * @param prop.options.secure - Specifies whether the session cookie should only be sent over secure connections.
   */
  set(
    data: { [key: string]: any },
    options: { expire: number; httpOnly: boolean; secure: boolean }
  ) {
    globalThis.setSession = options;
    globalThis.session.setData(data);
  }
  /**
   * Retrieves the session data.
   * @returns The session as _data or undefined if no session.
   */
  data<_data>() {
    return globalThis.session.session() as _data | undefined;
  }
  /**
   * Removes the session.
   */
  remove() {
    globalThis.sessionRemove = true;
  }
}

/** set cookie to the response (internal use only) */
export function cookieSetter(res: Response) {
  const set = globalThis.setSession;
  if (globalThis.sessionRemove) {
    globalThis.session.setData({});
    return globalThis.session.setCookie(res, {
      expire: -10000,
      httpOnly: true,
      secure: false,
    });
  }
  return set
    ? globalThis.session.setCookie(res, {
        expire: set.expire,
        httpOnly: set.httpOnly,
        secure: set.secure,
      })
    : res;
}

const session = new _session();
export default session;
