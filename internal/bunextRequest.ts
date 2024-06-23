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
}
