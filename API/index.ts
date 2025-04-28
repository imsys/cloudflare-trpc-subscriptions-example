import { zValidator } from "@hono/zod-validator";
import * as Hono from "hono";
import { cors } from "hono/cors"; // Keep cors if used within defined routes

// Import types needed for the define helper signature
import type { DurableObject } from "../DurableObject";

// Define a type for the Hono instance expected by API definitions
// Adjust generic if necessary based on your context/bindings usage in routes
export type HonoApp = Hono.Hono<{ Bindings: Env }>;

// Define a type for the helpers passed to API definition functions
export type ApiDefinitionHelpers = {
  api: HonoApp;
  validate: typeof zValidator;
  durableObject: DurableObject;
};

// Type alias for the function signature returned by API.define
export type RouteDefinition = (helpers: ApiDefinitionHelpers) => void;

export namespace API {
  export const basePath = "/api";

  export const define = (defineFn: RouteDefinition) => defineFn;

  export const validate = zValidator;

}

const basePath = API.basePath

export { basePath };