import { API } from "../API";
import { define as TRPCDefine } from "../TRPC/defs";

export namespace Sandbox {
  export const trpc = () => // This function acts as a router factory
    TRPCDefine((t) =>
      t.router({
        sandbox: t.router({
          hello: t.procedure.query(async () => {
            console.log("[Server] Handling hello query.");
            return "Hello from sandbox!";
          }),

          subscribe: t.procedure.subscription(() => {
            // Wrap the generator with the 'observable' helper
            return t.observable((observer) => {
              // server-side log for debugging
              console.log("[Server] Subscription procedure started.");
              // Simulate a stream of data with setInterval
              const intervalId = setInterval(() => {
                const now = new Date();
                console.log("[Server] Sending data:", now.toISOString());
                observer.next(now); // Send the current time
              }, 2000); // Send an update every 2 seconds

              // Return a cleanup function
              return () => {
                console.log("[Server] Subscription stopped.");
                clearInterval(intervalId); // Clear the interval when unsubscribed
              };
            });
          }),
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
