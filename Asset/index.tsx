import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

import { Fetch } from "~/Server";

export namespace Asset {
  export const fetch: Fetch = async (request, env, context) => {
    try {
      return await getAssetFromKV(
        { request, waitUntil: context.waitUntil.bind(context) },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: await manifest(),
        }
      );
    } catch (error) {
      return;
    }
  };

  const manifest = lazy(async () => {
    const manifestImportString = "__STATIC_CONTENT_MANIFEST";
    const manifestJSON = await import(/* @vite-ignore */ manifestImportString);
    return JSON.parse(manifestJSON.default);
  });
}
