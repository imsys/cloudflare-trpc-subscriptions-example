import * as TRPCServer from "@trpc/server";
import type { AnyRouter } from "@trpc/server";
import * as TRPCServerObservable from "@trpc/server/observable";
import * as TRPCServerRPC from "@trpc/server/rpc";
import { isAsyncIterable, getTRPCErrorFromUnknown } from "@trpc/server/unstable-core-do-not-import";

import { DurableObject } from "cloudflare:workers";

import { Context } from "./defs";

// --- Helper: isTrackedEnvelope (similar to @trpc/server) ---
function isTrackedEnvelope(value: unknown): value is [string | number, unknown] {
  return Array.isArray(value) && value.length === 2 && (typeof value[0] === 'string' || typeof value[0] === 'number');
}

// --- Helper: observableToAsyncIterable (simplified version) ---
// Note: This is a simplified implementation. The one in @trpc/server is more robust.
// It handles backpressure and abortion signals more gracefully.
// Consider adapting the official one if edge cases arise.
async function* observableToAsyncIterable<T>(
  observable: TRPCServerObservable.Observable<T, unknown>,
  signal?: AbortSignal
): AsyncGenerator<T, void, unknown> {
  let pullResolve: ((value: IteratorResult<T, void>) => void) | null = null;
  let pullReject: ((reason?: any) => void) | null = null;
  let pushQueue: T[] = [];
  let finished = false;
  let error: unknown | null = null;

  const unsubscribeObj: TRPCServerObservable.Unsubscribable = observable.subscribe({
    next(value) {
      if (pullResolve) {
        pullResolve({ value, done: false });
        pullResolve = null;
        pullReject = null;
      } else {
        pushQueue.push(value);
      }
    },
    error(err) {
      finished = true;
      error = err;
      if (pullReject) {
        pullReject(err);
        pullResolve = null;
        pullReject = null;
      }
      // Cleanup handled by signal listener or finally block
    },
    complete() {
      finished = true;
      if (pullResolve) {
        pullResolve({ value: undefined, done: true });
        pullResolve = null;
        pullReject = null;
      }
      // Cleanup handled by signal listener or finally block
    },
  });

  const onAbort = () => {
    finished = true;
    error = new TRPCServer.TRPCError({ code: 'CLIENT_CLOSED_REQUEST' });
    if (pullReject) {
      pullReject(error);
      pullResolve = null;
      pullReject = null;
    }
    unsubscribeObj.unsubscribe();
  };

  signal?.addEventListener('abort', onAbort);

  try {
    while (true) {
      if (signal?.aborted) {
        throw new TRPCServer.TRPCError({ code: 'CLIENT_CLOSED_REQUEST' });
      }

      if (pushQueue.length > 0) {
        yield pushQueue.shift()!;
      } else if (finished) {
        if (error) throw error;
        return; // Generator completes
      } else {
        // Wait for next value or completion
        yield await new Promise<T>((resolve, reject) => {
          pullResolve = (result) => result.done ? reject(new TRPCServer.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Pull promise resolved with done' })) : resolve(result.value);
          pullReject = reject;
        });
      }
    }
  } finally {
    // Cleanup
    signal?.removeEventListener('abort', onAbort);
    unsubscribeObj.unsubscribe();
    // Clear potential dangling promises
    pullResolve = null;
    pullReject = null;
  }
}


export namespace WebSocket {
  // Use message ID (number | string) as the key
  type SubscriptionID = number | string;
  export type State = {
    router: TRPCServer.AnyRouter;
    transformer: TRPCServer.CombinedDataTransformer;
    context: Context;
    // Store AbortController keyed by subscription ID
    activeSubscriptions: Map<
      SubscriptionID,
      {
        ws: WebSocket;
        abortController: AbortController;
      }
    >;
  };

  // ... State.create remains the same ...
  export namespace State {
    export const create = ({
      env,
      durableObject,
      router,
    }: {
      env: Env;
      durableObject: DurableObject<Env>;
      router: AnyRouter;
    }): State => {
      const transformer = router._def._config.transformer as TRPCServer.CombinedDataTransformer;
      return {
        router,
        transformer,
        context: { env: env, durableObject: durableObject },
        activeSubscriptions: new Map(),
      };
    };
  }

  export const accept =
    (durableObject: DurableObject<Env>) =>
      async (request: Request, env: any) => {
        // ... existing accept logic ...
        if (request.headers.get("Upgrade") !== "websocket") return;

        const webSocket = new WebSocketPair();
        const [client, server] = Object.values(webSocket);

        // Ensure the Durable Object state has `acceptWebSocket` method
        // This depends on the DO implementation using Hibernation API
        if (typeof ((durableObject as any).ctx as DurableObjectState).acceptWebSocket !== 'function') {
          console.error("DurableObject state does not have acceptWebSocket method. Hibernation API might not be correctly set up.");
          return new Response("WebSocket upgrade failed on server.", { status: 500 });
        }
        ((durableObject as any).ctx as DurableObjectState).acceptWebSocket(server);


        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      };

  export const webSocketMessage =
    (state: WebSocket.State) =>
      async (ws: WebSocket, rawMessage: ArrayBuffer | string) => {
        try {
          const message = JSON.parse(`${rawMessage}`);
          const messages: unknown[] = Array.isArray(message) ? message : [message];

          // Process messages sequentially for simplicity, or use Promise.all if needed
          for (const msg of messages) {
            await receive(ws, state).message(
              TRPCServerRPC.parseTRPCMessage(msg, state.transformer)
            );
          }
        } catch (error) {
          console.error("Failed to parse or process WebSocket message:", error);
          // Optionally send an error back to the client if possible/appropriate
          // This requires knowing the message ID, which might not be available if parsing failed
          // send(ws, state).error({ cause: new TRPCServer.TRPCError({ code: 'PARSE_ERROR', cause: error }) });
          ws.close(1003, "Invalid message format"); // Close with unsupported data code
        }
      };

  export const webSocketClose =
    (state: WebSocket.State) =>
      async (
        ws: WebSocket,
        _code: number,
        _reason: string,
        _wasClean: boolean
      ) => {
        // Abort all subscriptions associated with this specific WebSocket connection
        const subsToAbort: AbortController[] = [];
        const subsToRemove: SubscriptionID[] = [];

        state.activeSubscriptions.forEach((subscription, id) => {
          if (subscription.ws === ws) {
            subsToAbort.push(subscription.abortController);
            subsToRemove.push(id); // Mark for removal after aborting
          }
        });

        // Abort all relevant subscriptions
        subsToAbort.forEach(controller => controller.abort());

        // Clean up the map *after* aborting
        // (The iteration's finally block should also attempt removal, but this is a safety net)
        subsToRemove.forEach(id => state.activeSubscriptions.delete(id));

        console.log(`WebSocket closed. Aborted ${subsToAbort.length} subscriptions.`);
      };

  const receive = (ws: WebSocket, state: WebSocket.State) => ({
    stop: (message: TRPCServerRPC.TRPCClientOutgoingMessage) => {
      const subscriptionId = message.id; // ID from the original subscription request
      if (subscriptionId === undefined || subscriptionId === null) return; // Should not happen for stop

      const subscription = state.activeSubscriptions.get(subscriptionId);
      if (subscription) {
        console.log(`[Server] Stopping subscription ${subscriptionId}`);
        subscription.abortController.abort();
        // Let the iteration's finally block handle sending 'stopped' and cleanup
        // state.activeSubscriptions.delete(subscriptionId); // Removal is handled in the finally block
      } else {
        console.warn(`[Server] Could not find subscription ${subscriptionId} to stop.`);
      }
      // Do not send 'stopped' here, let the generator cleanup do it.
    },

    message: async (message: TRPCServerRPC.TRPCClientOutgoingMessage) => {
      const { id, jsonrpc } = message;

      if (message.method === "subscription.stop")
        return receive(ws, state).stop(message);

      if (id === undefined || id === null) {
        // Request without ID is invalid
        console.error("[Server] Received message without ID:", message);
        return send(ws, state).error({
          message, // Pass original message for context if available
          cause: new TRPCServer.TRPCError({
            code: "BAD_REQUEST",
            message: "`id` is required for requests expecting a response.",
          }),
        });
      }

      const ctx = state.context;
      const router = state.router;
      const type = message.method;
      const path = message.params.path;
      const input = message.params.input;

      try {
        // --- Call Procedure ---
        const result = await TRPCServer.callTRPCProcedure({
          ctx,
          router,
          type,
          path,
          input, // Pass deserialized input
          getRawInput: async () => input, // Provide raw input getter if needed by procedure
          signal: undefined, // We handle cancellation via AbortController later for subscriptions
        });

        // --- Handle Procedure Result ---
        if (type !== 'subscription') {
          // For queries and mutations, send the result directly
          if (isAsyncIterable(result) || TRPCServerObservable.isObservable(result)) {
            console.error(`[Server] Procedure ${path} returned streamable for non-subscription type ${type}`);
            throw new TRPCServer.TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Cannot return an async iterable or observable from a ${type} procedure via WebSocket.`,
            });
          }
          return send(ws, state).message({
            id,
            jsonrpc,
            result: { type: "data", data: result },
          });
        }

        // --- Handle Subscription Result ---
        let subscriptionIterable: AsyncIterable<unknown>;
        const abortController = new AbortController();

        if (TRPCServerObservable.isObservable(result)) {
          // Convert Observable to AsyncIterable
          subscriptionIterable = observableToAsyncIterable(result, abortController.signal);
        } else if (isAsyncIterable(result)) {
          // Use AsyncIterable directly
          subscriptionIterable = result;
        } else {
          // Invalid result type for subscription
          console.error(`[Server] Subscription ${path} did not return an Observable or AsyncGenerator.`);
          throw new TRPCServer.TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Expected an Observable or AsyncGenerator for subscriptions.",
          });
        }

        // --- Setup and Start Subscription ---
        // Check for duplicates before adding
        if (state.activeSubscriptions.has(id)) {
          console.error(`[Server] Duplicate subscription ID received: ${id}`);
          throw new TRPCServer.TRPCError({
            code: 'BAD_REQUEST',
            message: `Subscription ID ${id} is already active.`,
          });
        }

        // Store the subscription
        state.activeSubscriptions.set(id, { ws, abortController });
        console.log(`[Server] Starting subscription ${id} for path ${path}`);

        // Send 'started' message to client
        send(ws, state).started({ id });

        // --- Run Subscription Iteration ---
        // Run iteration in background, non-blocking
        (async () => {
          try {
            for await (const data of subscriptionIterable) {
              // Check if aborted between yields
              if (abortController.signal.aborted) {
                console.log(`[Server] Subscription ${id} aborted during iteration.`);
                break; // Exit loop gracefully
              }

              // Handle tracked envelopes if needed (from sandbox example)
              let resultPayload: TRPCServerRPC.TRPCResultMessage<unknown>['result'] = { type: 'data', data };
              if (isTrackedEnvelope(data)) {
                const [trackedId, trackedData] = data;
                resultPayload = {
                  type: 'data',
                  id: String(trackedId), // Send tracked ID
                  data: trackedData, // Send unwrapped data
                };
              }

              // Send data message
              send(ws, state).message({
                id,
                jsonrpc,
                result: resultPayload,
              });
            }
            // Iteration finished normally
            console.log(`[Server] Subscription ${id} iteration completed normally.`);
          } catch (cause) {
            // Handle errors during iteration
            if (abortController.signal.aborted || (cause instanceof TRPCServer.TRPCError && cause.code === 'CLIENT_CLOSED_REQUEST')) {
              console.log(`[Server] Subscription ${id} aborted with error/signal.`);
              // Don't send error if it was just an abort
            } else {
              const error = getTRPCErrorFromUnknown(cause);
              console.error(`[Server] Error in subscription ${id} (${path}):`, error);
              send(ws, state).error({ message, cause: error });
              // Let finally block handle stopped message and cleanup
            }
          } finally {
            // --- Cleanup ---
            console.log(`[Server] Cleaning up subscription ${id} (finally block).`);
            // Check if it hasn't been removed already (e.g., by webSocketClose)
            if (state.activeSubscriptions.has(id)) {
              // Send 'stopped' message ONLY if the subscription wasn't aborted externally before finishing
              // If aborted, the client initiated stop or connection closed, they don't need 'stopped'.
              // Check abort reason might be complex, simply checking signal is usually sufficient.
              if (!abortController.signal.aborted) {
                console.log(`[Server] Sending 'stopped' for subscription ${id}`);
                send(ws, state).stopped({ id });
              } else {
                console.log(`[Server] Skipping 'stopped' for aborted subscription ${id}`);
              }
              // Remove from active subscriptions
              state.activeSubscriptions.delete(id);
            }
          }
        })(); // End of async iteration function

      } catch (cause) { // Catch errors from callTRPCProcedure or subscription setup
        const error = getTRPCErrorFromUnknown(cause);
        console.error(`[Server] Error processing message for path ${path} (ID: ${id}):`, error);
        send(ws, state).error({ message, cause: error });
        // Clean up if a subscription was partially started before error
        if (type === 'subscription' && state.activeSubscriptions.has(id)) {
          state.activeSubscriptions.get(id)?.abortController.abort(); // Abort just in case
          state.activeSubscriptions.delete(id);
        }
      }
    },
  });

  const send = (ws: WebSocket, state: WebSocket.State) => ({
    message: (
      message: TRPCServerRPC.TRPCResponseMessage | TRPCServerRPC.TRPCResponse
    ) => {
      // Ensure WebSocket is open before sending
      // The state might vary depending on the exact Cloudflare WebSocket implementation
      // 1 is the standard WebSocket.OPEN state
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          ws.send(
            JSON.stringify(
              TRPCServer.transformTRPCResponse(
                state.router._def._config,
                message
              )
            )
          );
        } catch (error) {
          console.error("Failed to send WebSocket message:", error);
          // Close connection if send fails? Depends on desired behavior.
          // ws.close(1011, "Internal server error during send");
        }
      } else {
        console.warn("Attempted to send message on a non-open WebSocket:", message);
      }
    },

    started: ({ id }: Pick<TRPCServerRPC.TRPCClientOutgoingMessage, 'id'>) => {
      if (id === null || id === undefined) return; // Should have ID
      send(ws, state).message({ id, result: { type: "started" } });
    },

    stopped: ({ id }: Pick<TRPCServerRPC.TRPCClientOutgoingMessage, 'id'>) => {
      if (id === null || id === undefined) return; // Should have ID
      send(ws, state).message({ id, result: { type: "stopped" } });
    },

    error: ({
      message,
      cause,
    }: {
      message?: TRPCServerRPC.TRPCClientOutgoingMessage; // Make message optional for general errors
      cause?: TRPCServer.TRPCError | unknown;
    }) => {
      const error = cause instanceof TRPCServer.TRPCError ? cause : getTRPCErrorFromUnknown(cause);

      // Determine path and input safely based on message type
      let path: string | undefined = undefined;
      let input: unknown = undefined;
      let type: TRPCServer.ProcedureType | 'unknown' = 'unknown';

      // Only query/mutation/subscription messages have params
      if (message && (message.method === 'query' || message.method === 'mutation' || message.method === 'subscription')) {
        path = message.params.path;
        input = message.params.input;
        type = message.method; // Assign valid type
      } else if (message) {
        // For other message types like 'subscription.stop', keep type as 'unknown'
        type = 'unknown';
      }

      const errorShape = TRPCServer.getErrorShape({
        config: state.router._def._config,
        ctx: state.context,
        type: type,
        path: path,
        input: input,
        error: error,
      });

      send(ws, state).message({
        id: message?.id,
        error: errorShape,
      });
    },
  });
}
