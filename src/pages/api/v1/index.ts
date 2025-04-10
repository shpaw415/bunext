import type { BunextRequest } from "@bunpmjs/bunext/internal/server/bunextRequest.ts";

export function POST(request: BunextRequest) {
  const session = Bunext.session.get(arguments);
  console.log(session.getData());
  session.setData({ api: "test" }, true);

  request.response = new Response("POST");
  return request;
}

export function GET(request: BunextRequest) {
  request.response = new Response("GET");
  return request;
}

export function PUT(request: BunextRequest) {
  request.response = new Response("PUT");
  return request;
}

export function DELETE(request: BunextRequest) {
  request.response = new Response("DELETE");
  return request;
}
