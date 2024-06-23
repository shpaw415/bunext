"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type _SessionData<_SessionData> = {
  public: Record<string, _SessionData>;
  private: Record<string, _SessionData>;
};

declare global {
  var __PUBLIC_SESSION_DATA__: Record<string, any>;
}

export class _Session {
  private cookieName = "bunext_session_token";
  public __UPDATE__?: SessionUpdateClass;
  public __DATA__: _SessionData<any> = {
    public: {},
    private: {},
  };
  public __DELETE__: boolean = false;
  private sessionTimeout = 3600;
  private inited = false;

  constructor(data?: _SessionData<any>, sessionTimeout?: number) {
    if (data) this.__DATA__ = data;
    if (sessionTimeout) this.sessionTimeout = sessionTimeout;
  }

  /**
   * Server side only
   * @param data data to set in the token
   * @param Public the data can be accessed in the client context ( default: false )
   * @description update the data in the session. Current data will be keept
   */
  setData(data: Record<string, any>, Public: boolean = false) {
    this.PublicThrow("Session.setData cannot be called in a client context");

    const setPrivate = () => {
      this.__DATA__.private = {
        ...this.__DATA__.private,
        __BUNEXT_SESSION_CREATED_AT__: this.makeCreatedTime(),
        ...data,
      };
    };

    const setPublic = () => {
      this.__DATA__.public = {
        ...this.__DATA__.public,
        ...data,
      };
    };

    if (Public) {
      setPublic();
      setPrivate();
    } else {
      setPrivate();
    }
  }
  /**
   * Server side only
   * @description Reset session data.
   */
  reset() {
    this.PublicThrow("Session.reset cannot be called in a client context");
    this.__DATA__ = {
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
   * await Session.getData(); // {data: "someData"} | undefined
   */
  getData(): undefined | Record<string, any> {
    if (typeof window != "undefined") {
      if (!this.inited) {
        const setter = async () => {
          const res = await (await fetch("/bunextgetSessionData")).json();
          this.__DATA__.public = res;
          this.update();
        };
        this.inited = true;
        setter();
      }
      return this.__DATA__.public;
    }

    if (this.isExpired()) return undefined;

    return this.__DATA__.private;
  }
  /**
   * Server & Client
   * @description delete Session
   */
  delete() {
    if (this.isClient()) {
      document.cookie =
        this.cookieName + "=; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      this.__DATA__.public = {};
    } else this.__DELETE__ = true;
  }
  update() {
    if (typeof globalThis.__PUBLIC_SESSION_DATA__ != "undefined")
      this.__DATA__.public = globalThis.__PUBLIC_SESSION_DATA__;
    this.__UPDATE__?.update();
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
  private isExpired() {
    const createdAt = this.__DATA__.private.__BUNEXT_SESSION_CREATED_AT__ as
      | number
      | undefined;
    if (!createdAt) return true;
    return this.makeCreatedTime() > createdAt + this.sessionTimeout * 1000;
  }
  private makeCreatedTime() {
    return Math.floor(new Date().getTime() / 1000);
  }
}
export const Session = new _Session();

class SessionUpdateClass {
  public states: React.Dispatch<React.SetStateAction<boolean>>[] = [];
  public update() {
    for (const i of this.states) {
      i((c) => !c);
    }
  }
}

export const SessionUpdate = createContext(new SessionUpdateClass());

export function useSession(props?: { PreventRenderOnUpdate: boolean }) {
  const [state, setState] = useState(true);
  const _SessionContext = useContext(SessionUpdate);
  useEffect(() => {
    if (!props?.PreventRenderOnUpdate) _SessionContext.states.push(setState);
    Session.__UPDATE__ = _SessionContext;
  }, []);
  return Session;
}
