import { Exception } from "../Exception";
import { API, CloudFlare, Env, Fetch, TRPC } from "~/Server";

export class DurableObject {
  private readonly webSocketState: TRPC.WebSocket.State;

  constructor(public state: CloudFlare.DurableObjectState, private env: Env) {
    this.webSocketState = TRPC.WebSocket.State.create({
      env,
      durableObject: this,
    });
  }

  async fetch(request: Request) {
    return await Exception.tryCatchRequest(async () => {
      const response =
        (await TRPC.WebSocket.accept(this)(request, this.env)) ??
        (await API.fetch(this)(request, this.env));

      return response ?? new Response(null, { status: 404 });
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    return TRPC.WebSocket.webSocketMessage(this.webSocketState)(ws, message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    return TRPC.WebSocket.webSocketClose(this.webSocketState)(
      ws,
      code,
      reason,
      wasClean
    );
  }
}

export namespace DurableObject {
  export const fetch: Fetch = async (request, env) => {
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });

    const id = env.DURABLE_OBJECT.idFromName("public");
    const instance = env.DURABLE_OBJECT.get(id) as unknown as DurableObject;
    const response = await instance.fetch(request);

    if (response.status === 404) return;
    return response;
  };
}
