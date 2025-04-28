import { zValidator } from "@hono/zod-validator";
import * as Hono from "hono";
import { cors } from "hono/cors";

import { config, DurableObject, Env, Fetch } from "~/Server";

export type API = ReturnType<typeof API.create>;
export namespace API {
  export const basePath = () => "/api" as const;

  export const create = (durableObject: DurableObject) => {
    const api = new Hono.Hono<{ Bindings: Env }>().basePath("/api");

    api.use("*", cors());
    config().api.forEach((define) => define({ api, validate, durableObject }));

    return api;
  };

  export const define = (
    define: (helpers: {
      api: API;
      validate: typeof validate;
      durableObject: DurableObject;
    }) => void
  ) => define;

  export const validate = lazyFn(() => zValidator);

  export const fetch =
    (durableObject: DurableObject): Fetch.WithoutContext =>
    async (request, env) => {
      if (!new URL(request.url).pathname.startsWith(basePath())) return;
      return await create(durableObject).fetch(request, env);
    };
}
