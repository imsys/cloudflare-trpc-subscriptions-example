import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { Exception } from "./exception";

import {
  TRPCWebSocket,
  apiHandlerFactories,
  rootTrpcRouter
} from "./";

import { RouteDefinition, API as ApiHelpers } from "./api";

import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject<Env> {

  private readonly trpcWebSocketState: TRPCWebSocket.State;
  private readonly api: Hono<{ Bindings: Env }>;

  // The constructor signature changes slightly when extending
  // The base class constructor needs DurableObjectState and Env
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env); // Call the super constructor

    // Initialize WebSocket state using the imported TRPCWebSocket
    this.trpcWebSocketState = TRPCWebSocket.State.create({
      env: this.env, // Use this.env inherited from base class
      durableObject: this,
      router: rootTrpcRouter,
    });

    // --- Initialize Hono App for API routes ---
    this.api = new Hono<{ Bindings: Env }>().basePath(ApiHelpers.basePath);
    this.api.use('*', cors());

    // Register API routes from the imported factories
    apiHandlerFactories.forEach((defineApiRoute: RouteDefinition) => {
      defineApiRoute({
        api: this.api,
        durableObject: this
      });
    });
    // --- End Hono App Initialization ---
  }

  async fetch(request: Request): Promise<Response> {
    return await Exception.tryCatchRequest(async () => {
      const url = new URL(request.url);

      // 1. Check for WebSocket upgrade request
      const webSocketResponse = await TRPCWebSocket.accept(this)(request, this.env);
      if (webSocketResponse) {
        return webSocketResponse;
      }

      // 2. Check if it's an API request for Hono to handle
      if (url.pathname.startsWith(ApiHelpers.basePath)) {
        // Remove the third argument (ExecutionContext)
        // If needed later, use this.state.waitUntil() within the DO
        return await this.api.fetch(request, this.env);
      }

      // 3. If neither WebSocket nor API, return 404
      return new Response(null, { status: 404 });
    });
  }

  // Use imported TRPCWebSocket for WebSocket event handlers
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    return TRPCWebSocket.webSocketMessage(this.trpcWebSocketState)(ws, message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    return TRPCWebSocket.webSocketClose(this.trpcWebSocketState)(
      ws,
      code,
      reason,
      wasClean
    );
  }

}

export namespace MyDurableObject {

  export const fetch = (async (request, env:Cloudflare.Env, ctx) : Promise<Response> => {
    if (request.method === "OPTIONS") {
       return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      const id = env.DURABLE_OBJECT.idFromName("public");
      const stub = env.DURABLE_OBJECT.get(id);

      // Pass context (ctx) if the stub fetch signature allows/requires it
      // Note: Standard DO stub fetch doesn't take ctx. ExecutionContext is handled
      // by the main worker fetch handler wrapping this call.

      // Initiate DO Constructor on first run, and then runs the DO fetch().
      const response = await stub.fetch(request);

      // Check the response from the DO instance
      if (response.status === 404) {
        // Return undefined if the DO handled it but resulted in 404,
        // allowing downstream handlers (like static assets) to potentially run.
        //return undefined; // <-- Return undefined on 404
        return new Response("404 - not found", { status: 404 });
      }

      // Otherwise, return the response from the DO
      return response;

    } catch (e) {
      console.error("Error fetching from Durable Object:", e);
      // Decide error handling: rethrow, return specific error response, or return undefined?
      // Returning an error response is often safer.
      return new Response("Internal Server Error", { status: 500 });
    }
  }) as ExportedHandlerFetchHandler;
}