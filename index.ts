import { API } from "./API";
import { Asset } from "./Asset";
import { CloudFlare } from "./CloudFlare";
import { Context } from "./Context";
import { DurableObject } from "./DurableObject";
import { Env } from "./Env";
import { Exception } from "./Exception";
import { Fetch } from "./Fetch";
import { Key, Keys } from "./Key";
import { Sandbox } from "./Sandbox";
import { SPA } from "./SPA";
import { TRPC } from "./TRPC";

export {
  API,
  Asset,
  CloudFlare,
  Context,
  DurableObject,
  Env,
  Key,
  Keys,
  TRPC,
  type Fetch,
};

export const config = lazy(() => ({
  trpc: [Sandbox.trpc()],
  api: [TRPC.api(), Sandbox.api()],
}));

export namespace Server {
  export const fetch: Fetch = async (request, env, context) =>
    Exception.tryCatchRequest(
      async () =>
        (await DurableObject.fetch(request, env, context)) ??
        (await Asset.fetch(request, env, context)) ??
        (await SPA.fetch(request, env, context))
    );
}
