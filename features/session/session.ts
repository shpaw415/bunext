"use client";
import { generateRandomString } from "../utils";
import type { BunextRequest } from "../../internal/server/bunextRequest";
import { GetSessionByID } from "../../internal/session.ts";
import { createContext, useContext, useEffect, useState } from "react";
import { RequestContext } from "../../internal/server/context";
export { GetSession } from "../request/bunextRequest";

export type _SessionData<_SessionData> = {
  public: Record<string, _SessionData>;
  private: Record<string, _SessionData> & {
    __BUNEXT_SESSION_CREATED_AT__?: number;
  };
};

declare global {
  var __PUBLIC_SESSION_DATA__: Record<string, any>;
  var __SESSION_TIMEOUT__: number;
  // @ts-ignore
  var __BUNEXT_SESSION__: _Session<any>;
}

export type InAppSession<DataType> = Omit<
  _Session<DataType>,
  | "__UPDATE__"
  | "__DATA__"
  | "__DELETE__"
  | "isUpdated"
  | "initData"
  | "updated_id"
  | "setSessionTimeout"
  | "session_expiration_override"
>;
export class _Session<DataType> {
  public __DATA__: _SessionData<any> = {
    public: {},
    private: {},
  };
  public __DELETE__: boolean = false;
  public isUpdated = false;
  public sessionTimeoutFromNow = 3600;
  private request?: BunextRequest;
  private update_function?: React.Dispatch<React.SetStateAction<boolean>>;
  public updated_id = generateRandomString(5);
  public session_expiration_override?: number;

  constructor({
    data,
    sessionTimeout,
    request,
    update_function,
  }: {
    data?: _SessionData<any>;
    sessionTimeout?: number;
    request?: BunextRequest;
    update_function?: _Session<any>["update_function"];
  }) {
    if (data) this.__DATA__ = data;
    if (sessionTimeout) this.sessionTimeoutFromNow = sessionTimeout;
    if (request) this.request = request;
    if (update_function) this.update_function = update_function;
  }
  /**
   * override set the session expiration
   * @param expiration expiration in seconds
   */
  setExpiration(expiration: number) {
    this.session_expiration_override = expiration;
    return this;
  }
  public getSessionTimeout() {
    return globalThis.__SESSION_TIMEOUT__;
  }
  public setSessionTimeout(value: number) {
    globalThis.__SESSION_TIMEOUT__ = value;
  }
  private setPublicData(data: Record<string, any> | DataType) {
    this.__DATA__.public = {
      ...this.__DATA__.public,
      ...data,
      __SESSION_TIMEOUT__: this.getSessionTimeout(),
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
   * @description update the data in the session. Current data will be kept
   */
  setData(data: Partial<DataType>, Public: boolean = false) {
    this.PublicThrow("Session.setData cannot be called in a client context");
    if (!this.request) throw new Error("no request found to set session");

    this.isUpdated = true;

    if (Public) {
      this.setPrivateData(data);
      this.setPublicData(data);
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
  getData(getPublic: boolean = false): DataType | undefined {
    if (typeof window != "undefined") {
      if (this.isExpired()) return undefined;
      else return this.__DATA__.public as DataType | undefined;
    }

    if (!this.SessionExists()) {
      return undefined;
    }

    if (this.isExpired()) {
      this.delete();
      return undefined;
    }

    return getPublic
      ? (this.__DATA__.public as DataType | undefined)
      : (this.__DATA__.private as DataType | undefined);
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
    this.__DATA__.public = globalThis.__PUBLIC_SESSION_DATA__;
    this.update_function?.((c) => !c);
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
    if (typeof window != "undefined") {
      if (globalThis.__SESSION_TIMEOUT__ - new Date().getTime() > 0)
        return false;
      else return true;
    }

    const createdAt = this.__DATA__.private.__BUNEXT_SESSION_CREATED_AT__ as
      | number
      | undefined;
    if (!createdAt) return true;
    return (
      this.makeCreatedTime() > createdAt + this.sessionTimeoutFromNow * 1000
    );
  }
  private makeCreatedTime() {
    return new Date().getTime();
  }
}

export const SessionContext = createContext<_Session<any>>(new _Session({}));
export const SessionDidUpdateContext = createContext(false);

/**
 * return the session object
 */
export function useSession<DataType>() {
  const server_session = useContext(RequestContext);
  const session = useContext(SessionContext);
  const did_update = useContext(SessionDidUpdateContext);
  const [, setState] = useState(false);

  useEffect(() => setState(did_update), [did_update]);

  return (
    (server_session?.session as InAppSession<DataType>) ??
    (session as InAppSession<DataType>)
  );
}
