export function sendSignal() {
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}

export type DevWsMessageTypes = "reboot-server";

export const DevWsMessageHandler: Array<(message: DevWsMessageTypes, data: any, ws: Bun.ServerWebSocket<undefined>) => void> = [
  (message) => message === "reboot-server" && globalThis.Server?.Reboot()
];

export function addDevWsMessageHandler(
  handler: (message: DevWsMessageTypes, ws: Bun.ServerWebSocket<undefined>) => void
) {
  DevWsMessageHandler.push(handler);
}

export function removeDevWsMessageHandler(
  handler: (message: DevWsMessageTypes, ws: Bun.ServerWebSocket<undefined>) => void
) {
  const index = DevWsMessageHandler.indexOf(handler);
  if (index !== -1) {
    DevWsMessageHandler.splice(index, 1);
  }
}

export function ClientSendWSMessage({
  message,
  data,
  ws
}: {
  message: DevWsMessageTypes;
  data?: any;
  ws?: WebSocket;
}) {
  return ws?.send(JSON.stringify({ type: message, data }));
}