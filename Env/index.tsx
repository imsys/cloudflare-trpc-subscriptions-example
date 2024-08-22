import { configDotenv } from "dotenv";
import { OverrideProperties } from "type-fest";
import { z } from "zod";

import { CloudFlare } from "~/Server";

export type Env = OverrideProperties<
  zInfer<typeof Env.schema>,
  { DURABLE_OBJECT: CloudFlare.DurableObjectNamespace }
>;

export namespace Env {
  export const schema = lazy(() =>
    z.object({
      __STATIC_CONTENT: z.string(),

      API_BASE_URL: z.string(),

      DURABLE_OBJECT: z
        .unknown()
        .transform((value) => value as CloudFlare.DurableObjectNamespace),
    })
  );

  export const fromEnvVars = () => {
    configDotenv();

    return schema().parse({
      __STATIC_CONTENT: "{}",
      DURABLE_OBJECT: {
        fetch: () => doNothing(),
      },
      ...process.env,
    });
  };
}
