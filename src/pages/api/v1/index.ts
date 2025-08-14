import type { BunextRequest } from "bunext-js/request";

export function POST(request: BunextRequest) {
  const session = Bunext.session.get(arguments);
  console.log(session.getData());
  session.setData({ api: "test" }, true);

  return new Response("POST");
}

export function GET(request: BunextRequest) {
  return new Response("GET");
}

export function PUT(request: BunextRequest) {
  return new Response("PUT");
}

export function DELETE(request: BunextRequest) {
  return new Response("DELETE");
}
