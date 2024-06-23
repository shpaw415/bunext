import type { BunextRequest } from "../../../../internal/bunextRequest";

export function POST(request: BunextRequest) {
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
