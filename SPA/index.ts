import { Asset, Fetch } from "~/Server";

export namespace SPA {
  export const fetch: Fetch = async (request, env, context) =>
    Asset.fetch(
      new Request(`${new URL(request.url).origin}/index.html`),
      env,
      context
    );
}
