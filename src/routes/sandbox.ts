import { API } from "./../api";
import { define as TRPCDefine } from "../TRPC/defs";
import { tracked } from '@trpc/server';
import { z } from 'zod';

// Define optional input if using tracked with lastEventId
const subscribeInputSchema = z.object({
  lastEventId: z.string().optional(),
}).optional();


export namespace Sandbox {

  // Endpoint at /api/trpc
  export const trpc = () => // This function acts as a router factory
    TRPCDefine((t) =>
      t.router({
        sandbox: t.router({
          hello: t.procedure.query(async () => {
            console.log("[Server] Handling hello query.");
            return "Hello from sandbox!";
          }),

          // Refactored subscription using async function*
          subscribe: t.procedure
            .input(subscribeInputSchema)
            .subscription(async function* (opts) {
              // Access input safely:
              const lastEventId = opts.input?.lastEventId;
              console.log(`[Server] Async Generator Subscription started. Last received ID: ${lastEventId ?? 'none'}`);

              let counter = 0; // Example state

              // --- Optional: Handle reconnection ---
              if (lastEventId) {
                 console.log(`[Server] Client provided lastEventId: ${lastEventId}. Resuming logic would go here.`);
                 // Example: Parse counter from lastEventId if it was encoded there
                 // const parts = lastEventId.split('-');
                 // if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
                 //   counter = parseInt(parts[1]) + 1;
                 //   console.log(`[Server] Resuming counter from ${counter}`);
                 // }
                 // You might fetch missed events from a DB here based on the ID/timestamp
              }
              // --- End Optional Reconnection ---


              try {
                while (true) {
                  // Safely check if the client disconnected
                  if (opts.signal?.aborted) { // <-- Check signal safely
                    console.log("[Server] Client disconnected (AbortSignal).");
                    break; // Exit the loop
                  }

                  const now = new Date();
                  const eventId = `${now.getTime()}-${counter++}`; // Create a unique ID for tracking
                  console.log(`[Server] Yielding data: ${now.toISOString()} with ID: ${eventId}`);

                  // Yield the data using tracked()
                  yield tracked(eventId, now);

                  // Wait for 2 seconds
                  try {
                      // Await the promise, but don't pass the signal directly to the basic setTimeout
                      await new Promise(resolve => setTimeout(resolve, 2000));
                  } catch (e) {
                      // Handle potential errors during the delay if using signal-aware timers
                      if (opts.signal?.aborted) {
                          console.log("[Server] Delay aborted by client disconnect.");
                          break;
                      }
                      throw e; // Rethrow other errors
                  }
                }
              } catch (error) {
                 // Don't log expected cancellation errors
                 if (opts.signal?.aborted) {
                    console.log("[Server] Subscription cancelled by client.");
                 } else {
                    console.error("[Server] Error in subscription generator:", error);
                 }
                 // tRPC handles propagating the error or closing the connection
                 throw error;
              } finally {
                console.log("[Server] Async Generator Subscription stopped (finally block).");
              }
              console.log("[Server] Async Generator Subscription explicitly finished.");
            }),
        }),
      })
    );

  // Endpoint at /api/sandbox
  export const api = () =>
    API.define(({ api }) =>
      api.get("/sandbox", async (context) =>
        context.json({ message: "Hello, World!" })
      )
    );
}
