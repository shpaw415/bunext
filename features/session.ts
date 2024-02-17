/** get session data from the token. (undefined if not set) */
export function getSession<_Data>() {
  return globalThis.bunext_Session.session() as _Data | undefined;
}
/** set session data to the token */
export function setSession(data: { [key: string]: any }) {
  globalThis.bunext_SessionData = data;
}

export function deleteSession() {
  globalThis.bunext_SessionDelete = true;
}
