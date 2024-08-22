import { CloudFlare, Env } from "~/Server";

export type Fetch<R = Response | undefined> = (
  request: Request,
  env: Env,
  context: CloudFlare.ExecutionContext
) => Promise<R>;

export namespace Fetch {
  export type WithoutContext<R = Response | undefined> = (
    request: Request,
    env: Env
  ) => Promise<R>;
}
