import { initTRPC } from "@trpc/server";
import {
	Observable as TRPCObservable,
	observable as trpcObservable,
	Observer as TRPCObserver,
} from "@trpc/server/observable";
import { SuperJSON } from "superjson";
import { DurableObject } from "cloudflare:workers";

// Export core types with renamed aliases
export { type TRPCObservable as TRPCSubObservable, type TRPCObserver as TRPCSubObserver }; // <-- Renamed here

export type Context = {
  env: Env;
  durableObject: DurableObject<Env>;
};

// Initialize tRPC - this is the core instance
export const trpc = initTRPC.context<Context>().create({
  transformer: SuperJSON,
});

// Export helpers derived from the core instance
export const router = trpc.router;
export const merge = trpc.mergeRouters;
export const procedure = trpc.procedure;
// Keep internal `observable` helper as is, only rename exported *types*
export const observable = trpcObservable;

// Export the define function signature for creating routers in other modules
export function define<A>(
  define: (t: {
    trpc: typeof trpc;
    router: typeof router;
    merge: typeof merge;
    procedure: typeof procedure;
    observable: typeof observable; // Pass the internal helper name
  }) => A
): A {
  // Pass the direct references to the helpers
  return define({
    trpc,
    router,
    merge,
    procedure,
    observable,
  });
}
