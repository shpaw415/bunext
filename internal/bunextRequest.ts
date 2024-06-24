import { _Session, type _SessionData } from "../features/session";
import { webToken } from "@bunpmjs/json-webtoken";
import "./server_global";

export class BunextRequest {
  public request: Request;
  public response: Response;
  public session: _Session;
  public webtoken: webToken<any>;

  constructor(props: { request: Request; response: Response }) {
    this.request = props.request;
    this.response = props.response;
    this.webtoken = new webToken<any>(this.request, {
      cookieName: "bunext_session_token",
    });
    this.session = new _Session(
      this.webtoken.session() as _SessionData<any>,
      globalThis.serverConfig.session?.timeout
    );
  }
  public __SET_RESPONSE__(response: Response) {
    this.response = response;
    return this;
  }
  public setCookie(response: Response) {
    this.webtoken.setData(this.session.__DATA__);
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
