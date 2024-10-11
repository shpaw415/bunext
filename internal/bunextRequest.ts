import { _Session, type _SessionData } from "../features/session";
import { webToken } from "@bunpmjs/json-webtoken";
import "./server_global";
import { GetSessionByID, SetSessionByID } from "./session";

export class BunextRequest {
  public request: Request;
  public response: Response;
  public session: _Session;
  public webtoken: webToken<any>;
  /**
   * only avalable when serverConfig.session.type == "database:hard" | "database:memory"
   */
  private SessionID?: string;

  constructor(props: { request: Request; response: Response }) {
    this.request = props.request;
    this.response = props.response;
    this.webtoken = new webToken<any>(this.request, {
      cookieName: "bunext_session_token",
    });
    switch (globalThis.serverConfig.session?.type) {
      case "database:hard":
      case "database:memory":
        this.SessionID =
          (this.webtoken.session() as undefined | string) || SetSessionByID();
        this.session = undefined as any;
        break;
      case "cookie":
      case undefined:
        this.session = new _Session(
          this.webtoken.session() as _SessionData<any>,
          globalThis.serverConfig.session?.timeout
        );
        break;
    }
  }
  public async __INIT__() {
    if (globalThis.serverConfig.session?.type != "database:memory") return this;
    this.session = new _Session(
      (await GetSessionByID(this.SessionID)) as _SessionData<any>,
      globalThis.serverConfig.session?.timeout
    );
    return this;
  }
  public __SET_RESPONSE__(response: Response) {
    this.response = response;
    return this;
  }
  public setCookie(response: Response) {
    switch (globalThis.serverConfig.session?.type) {
      case "database:hard":
      case "database:memory":
        this.webtoken.setData(this.webtoken.session());
        if (this.session.__DELETE__ || this.session.isUpdated) {
          SetSessionByID(this.SessionID, this.session.__DATA__);
        }
        break;
      case "cookie":
      case undefined:
        this.webtoken.setData(this.session.__DATA__);
        break;
    }
    if (this.session.__DELETE__) {
      this.webtoken.setData({});
      this.session.reset();
    }
    const setExpire = () => {
      if (this.session.__DELETE__) return -100000;
      return globalThis.serverConfig.session?.timeout || 3600;
    };

    return this.webtoken.setCookie(response, {
      expire: setExpire(),
      httpOnly: true,
      secure: false,
    });
  }
}
