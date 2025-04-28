import { API, RouteDefinition } from "./API";
import { DurableObject } from "./DurableObject";
// import { Env } from "./Env";
import { Exception } from "./Exception";
import { Sandbox } from "./Sandbox";


import { merge as mergeRouters } from './TRPC/defs';
import { createTrpcApiHandler } from './TRPC';

import { WebSocket as TRPCWebSocket } from './TRPC';


import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";


// --- Application Setup ---

// Merge TRPC Routers
export const rootTrpcRouter = mergeRouters(
  Sandbox.trpc(),
);

// Define Final TRPC Router Type and Input/Output Types
export type AppRouter = typeof rootTrpcRouter;
export type TRPCInputs = inferRouterInputs<AppRouter>;
export type TRPCOutputs = inferRouterOutputs<AppRouter>;

// Define API Handler Factories
// These are functions that return API definitions (e.g., Hono middleware/routes)
export const apiHandlerFactories: RouteDefinition[] = [
  createTrpcApiHandler(rootTrpcRouter),
  Sandbox.api(),
  // Add other API handler factories here
  // e.g., Auth.api, Posts.api
];

// . Configure Durable Object (or main application) with API definitions
// This depends on how your DurableObject consumes API handlers.
// You might need to adapt DurableObject.fetch or add a configuration step.
// Example: Assuming DurableObject has a method to register API definitions
// (This is a placeholder - adapt to your actual DurableObject setup)
// DurableObject.registerApis(apiHandlerFactories);
// Or maybe DurableObject.fetch internally creates a Hono app and uses these:
// const app = new Hono();
// apiHandlerFactories.forEach(factory => factory()({ api: app, /* other context */ }));

// --- Exports ---

export {
  API,
  DurableObject,
  TRPCWebSocket
};


// Default export for Cloudflare Workers Entry Point
export default {
  fetch : (async (request, env:Cloudflare.Env , context) : Promise<Response> =>
    Exception.tryCatchRequest(
      async () =>
        // Ensure DurableObject.fetch is correctly configured to use the
        // merged router (rootTrpcRouter) or the apiHandlerFactories
        (await DurableObject.fetch(request, env, context))
        // Alternative handlers (Asset, SPA) if applicable
    )) as ExportedHandlerFetchHandler
};

