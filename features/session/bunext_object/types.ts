import type { useSession, GetSession } from "../session";

export type Session = {
  hook: Hook;
  get: Get;
};

type Hook = {
  /**
   * return the session object
   */
  useSession: typeof useSession;
};

/**
 * get session from a server context ( ServerAction )
 * @param args
 * @example GetSession(arguments)
 */
type Get = typeof GetSession;
