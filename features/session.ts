"use client";
import type { BunextRequest } from "@bunpmjs/bunext/internal/bunextRequest";
import { GetSessionByID } from "@bunpmjs/bunext/internal/session";
import { createContext, useContext, useEffect, useState } from "react";
export { GetSession } from "./bunextRequest";

export type _SessionData<_SessionData> = {
  public: Record<string, _SessionData>;
  private: Record<string, _SessionData>;
};

declare global {
  var __PUBLIC_SESSION_DATA__: Record<string, any>;
  // @ts-ignore
  var __BUNEXT_SESSION__: _Session<any>;
}

export type InAppSession<DataType> = Omit<
  _Session<DataType>,
  "__UPDATE__" | "__DATA__" | "__DELETE__" | "isUpdated" | "initData"
>;
export class _Session<DataType> {
  private cookieName = "bunext_session_token";
  public __UPDATE__?: SessionUpdateClass;
  public __DATA__: _SessionData<any> = {
    public: {},
    private: {},
  };
  public __DELETE__: boolean = false;
  public isUpdated = false;
  private sessionTimeout = 3600;
  private inited = false;
  private request?: BunextRequest;

  constructor(
    data?: _SessionData<any>,
    sessionTimeout?: number,
    request?: BunextRequest
  ) {
    if (data) this.__DATA__ = data;
    if (sessionTimeout) this.sessionTimeout = sessionTimeout;
    if (request) this.request = request;
  }
  private setPublicData(data: Record<string, any> | DataType) {
    this.__DATA__.public = {
      ...this.__DATA__.public,
      ...data,
    };
  }
  private setPrivateData(data: Record<string, any> | DataType) {
    this.__DATA__.private = {
      ...this.__DATA__.private,
      __BUNEXT_SESSION_CREATED_AT__: this.makeCreatedTime(),
      ...data,
    };
    this.isUpdated = true;
  }
  /**
   * Server side only
   * @param data data to set in the token
   * @param Public the data can be accessed in the client context ( default: false )
   * @description update the data in the session. Current data will be keept
   */
  setData(data: Partial<DataType>, Public: boolean = false) {
    this.PublicThrow("Session.setData cannot be called in a client context");
    if (!this.request) throw new Error("no request found to set session");

    this.isUpdated = true;

    if (Public) {
      this.setPublicData(data);
      this.setPrivateData(data);
    } else {
      this.setPrivateData(data);
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
  async initData() {
    if (!this.request) return;
    switch (globalThis.serverConfig.session?.type) {
      case "cookie":
        const sessionData = this.request.webtoken.session();
        if (sessionData) this.__DATA__ = sessionData;
        break;
      case "database:memory":
      case "database:hard":
        const RecData = await GetSessionByID(this.request.SessionID);
        if (RecData) this.__DATA__ = RecData;
        break;
    }
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
  getData(): DataType | undefined {
    if (typeof window != "undefined") {
      if (!this.inited) {
        const setter = async () => {
          const res = await (await fetch("/bunextgetSessionData")).json();
          this.__DATA__.public = res;
          if (typeof window != "undefined")
            globalThis.__PUBLIC_SESSION_DATA__ = res;
          this.update();
        };
        this.inited = true;
        setter();
      }
      this.__DATA__.public = globalThis.__PUBLIC_SESSION_DATA__;
      return this.__DATA__.public as DataType | undefined;
    }

    if (!this.SessionExists()) {
      return undefined;
    }

    if (this.isExpired()) {
      this.delete();
      return undefined;
    }

    return this.__DATA__.private as DataType | undefined;
  }
  /**
   * Server & Client
   * @description delete Session
   */
  delete() {
    if (this.isClient()) {
      fetch("/bunextDeleteSession").then(() => {
        this.__DATA__.public = {};
        globalThis.__PUBLIC_SESSION_DATA__ = {};
        this.update();
      });
    } else {
      this.__DELETE__ = true;
      this.__DATA__ = {
        public: {},
        private: {},
      };
    }
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
  private SessionExists() {
    return (
      typeof this.__DATA__.private.__BUNEXT_SESSION_CREATED_AT__ != "undefined"
    );
  }
  private isExpired() {
    const createdAt = this.__DATA__.private.__BUNEXT_SESSION_CREATED_AT__ as
      | number
      | undefined;
    if (!createdAt) return true;
    return this.makeCreatedTime() > createdAt + this.sessionTimeout * 1000;
  }
  private makeCreatedTime() {
    return new Date().getTime();
  }
}

export const Session = new _Session(undefined, undefined);
//globalThis.__BUNEXT_SESSION__ ??= Session;

class SessionUpdateClass {
  public states: React.Dispatch<React.SetStateAction<boolean>>[] = [];
  public update() {
    for (const i of this.states) {
      i((c) => !c);
    }
  }
}

export const SessionUpdate = createContext(new SessionUpdateClass());

export function useSession<DataType>(props?: { PreventRenderOnUpdate: boolean }) {
  const [state, setState] = useState(true);
  const _SessionContext = useContext(SessionUpdate);
  useEffect(() => {
    if (!props?.PreventRenderOnUpdate) _SessionContext.states.push(setState);
    Session.__UPDATE__ = _SessionContext;
    return () => {
      _SessionContext.states.splice(
        _SessionContext.states.indexOf(setState),
        1
      );
    };
  }, []);
  return Session as InAppSession<DataType>;
}
