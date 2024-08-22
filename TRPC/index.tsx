import { trpcServer } from "@hono/trpc-server";
import { inferRouterInputs, inferRouterOutputs, initTRPC } from "@trpc/server";

import {
  Observable as TRPCObservable,
  observable as trpcObservable,
  Observer as TRPCObserver,
} from "@trpc/server/observable";

import { MiddlewareHandler } from "hono";
import { SuperJSON } from "superjson";

import { API, config, Context, DurableObject } from "~/Server";

import { WebSocket } from "./WebSocket";

export type TRPC = ReturnType<typeof TRPC.root>;
export declare namespace TRPC {
  export { WebSocket, TRPCObservable as Observable, TRPCObserver as Observer };
}

export namespace TRPC {
  TRPC.WebSocket = WebSocket;

  export type Inputs = inferRouterInputs<TRPC>;
  export type Outputs = inferRouterOutputs<TRPC>;

  export const trpc = lazy(() =>
    initTRPC.context<Context>().create({
      transformer: SuperJSON,
    })
  );

  export const router = lazyFn(() => trpc().router);
  export const merge = lazyFn(() => trpc().mergeRouters);
  export const procedure = lazy(() => trpc().procedure);
  export const observable = lazyFn(() => trpcObservable);
  export const root = lazy(() => merge(...config().trpc));

  const handler = (durableObject: DurableObject): MiddlewareHandler =>
    trpcServer({
      endpoint: `${API.basePath()}/trpc`,
      router: root(),
      createContext: () => ({ durableObject }),
    });

  export const api = lazy(() =>
    API.define(({ api, durableObject }) =>
      api.use("/trpc/*", handler(durableObject))
    )
  );

  export function define<A>(
    define: (t: {
      trpc: typeof trpc;
      router: typeof router;
      merge: typeof merge;
      procedure: typeof procedure;
      observable: typeof observable;
    }) => A
  ): A {
    return define({
      trpc,
      router,
      merge,
      procedure,
      observable,
    });
  }
}
