import { trpcServer } from "@hono/trpc-server";
import { AnyRouter } from "@trpc/server";

import { API } from "../API";

import { TRPCSubObservable,  TRPCSubObserver } from "./defs";

import { WebSocket } from "./WebSocket";

export { WebSocket };

export type { TRPCSubObservable, TRPCSubObserver };


export const createTrpcApiHandler = (router: AnyRouter) => // Accept the router
  API.define(({ api, durableObject }) =>
    // Inline the trpcServer configuration directly
    api.use(
      `${API.basePath}/trpc/*`, // "/trpc/*" // Use the correct base path prefix if needed, e.g., `${API.basePath()}/trpc/*`
      trpcServer({
        // endpoint: `${API.basePath()}/trpc`, // Endpoint might not be strictly needed if basePath handles it
        router: router, // Use the passed router
        createContext: () => ({ durableObject }), // Use durableObject from the API.define helper
        // Consider adding onError handler here
      })
    )
  );
