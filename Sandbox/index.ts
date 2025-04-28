import { z } from "zod";

import { AI, OpenAI } from "~/AI";
import { Cohere } from "~/AI/Cohere";
import { API, TRPC } from "~/Server";
import { JSONSchema } from "~/Utility";

export namespace Sandbox {
  export const trpc = () =>
    TRPC.define((t) =>
      t.router({
        sandbox: t.router({
          subscribe: t.procedure().subscription(() =>
            t.observable((emit) => {
              const interval = setInterval(() => emit.next(new Date()), 1000);
              return () => clearInterval(interval);
            })
          ),
        }),
      })
    );

  export const api = () =>
    API.define(({ api }) =>
      api.get("/sandbox", async (context) =>
        context.json({ message: "Hello, World!" })
      )
    );
}
