import { Script } from "./jsx-utils";
import { addScriptToResponse } from "./server-response";

export function setDevEnvironement() {
  addScriptToResponse(
    <Script src={hotRealodClient} call key={"dev-reload-script"}></Script>
  );
}

function hotRealodClient(reload: boolean) {
  let socket;
  let error = false;
  const interval = setInterval(() => {
    try {
      socket = new WebSocket("ws://localhost:3001");
      socket.addEventListener("message", (event) => {
        if (event.data.toString("utf-8").trim() === "reload") {
          window.location.reload();
        }
      });
      socket.addEventListener("close", () => {
        hotRealodClient(true);
      });
      if (error || reload) window.location.reload();
      clearInterval(interval);
    } catch {
      error = true;
    }
  }, 1000);
}
