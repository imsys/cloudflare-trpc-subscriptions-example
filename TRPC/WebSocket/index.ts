import * as TRPCServer from "@trpc/server";
import * as TRPCServerObservable from "@trpc/server/observable";
import * as TRPCServerRPC from "@trpc/server/rpc";
import * as TRPCUtilities from "@trpc/server/shared";

import { Context, DurableObject, Env, Fetch, TRPC } from "~/Server";

export namespace WebSocket {
  export type State = {
    router: TRPCServer.AnyRouter;
    transformer: TRPCServer.CombinedDataTransformer;
    context: Context;
    activeSubscriptions: Map<
      ID,
      {
        ws: WebSocket;
        unsubscribe: TRPCServerObservable.Unsubscribable["unsubscribe"];
      }
    >;
  };

  export namespace State {
    export const create = ({
      env,
      durableObject,
    }: {
      env: Env;
      durableObject: DurableObject;
    }): State => {
      const router = TRPC.root();
      return {
        router,
        transformer: TRPC.root()._def._config
          .transformer as never as TRPCServer.CombinedDataTransformer,
        context: Context.create({ env: env, durableObject: durableObject }),
        activeSubscriptions: new Map(),
      };
    };
  }

  export const accept =
    (durableObject: DurableObject): Fetch.WithoutContext =>
    async (request) => {
      if (request.headers.get("Upgrade") !== "websocket") return;

      const webSocket = new WebSocketPair();
      const [client, server] = Object.values(webSocket);

      durableObject.state.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    };

  export const webSocketMessage =
    (state: WebSocket.State) =>
    async (ws: WebSocket, rawMessage: ArrayBuffer | string) => {
      const message = JSON.parse(`${rawMessage}`);
      const messages: unknown[] = Array.isArray(message) ? message : [message];

      await Promise.resolve(
        messages.map(async (message) =>
          receive(ws, state).message(
            TRPCServerRPC.parseTRPCMessage(message, state.transformer)
          )
        )
      );
    };

  export const webSocketClose =
    (state: WebSocket.State) =>
    async (
      ws: WebSocket,
      _code: number,
      _reason: string,
      _wasClean: boolean
    ) => {
      state.activeSubscriptions.forEach((subscription) => {
        if (subscription.ws === ws) subscription.unsubscribe();
      });
    };

  const receive = (ws: WebSocket, state: WebSocket.State) => ({
    stop: (message: TRPCServerRPC.TRPCClientOutgoingMessage) => {
      send(ws, state).stopped(message);
    },

    message: async (message: TRPCServerRPC.TRPCClientOutgoingMessage) => {
      if (message.method === "subscription.stop")
        return receive(ws, state).stop(message);

      if (message.id === undefined)
        return send(ws, state).error({
          message,
          cause: new TRPCServer.TRPCError({
            code: "BAD_REQUEST",
            message: "`id` is required!",
          }),
        });

      const result = await TRPCServer.callProcedure({
        ctx: state.context,
        procedures: state.router._def.procedures,
        type: message.method,
        path: message.params.path,
        input: message.params.input,
        rawInput: message.params.input,
      });

      if (message.method !== "subscription")
        return send(ws, state).message({
          id: message.id,
          jsonrpc: message.jsonrpc,
          result: { type: "data", data: result },
        });

      if (!TRPCServerObservable.isObservable(result))
        return send(ws, state).error({
          message,
          cause: new TRPCServer.TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Expected an observable!",
          }),
        });

      const subscriptionID = crypto.randomUUID();
      const subscription = result.subscribe({
        next: (data) =>
          send(ws, state).message({
            id: message.id,
            jsonrpc: message.jsonrpc,
            result: { type: "data", data },
          }),

        complete: () => {
          send(ws, state).stopped(message);
          state.activeSubscriptions.delete(subscriptionID);
        },
        error: (cause) => {
          send(ws, state).error({ message, cause });
          state.activeSubscriptions.delete(subscriptionID);
        },
      });

      state.activeSubscriptions.set(subscriptionID, {
        ws: ws,
        unsubscribe: subscription.unsubscribe,
      });

      send(ws, state).started(message);
    },
  });

  const send = (ws: WebSocket, state: WebSocket.State) => ({
    message: (
      message: TRPCServerRPC.TRPCResponseMessage | TRPCServerRPC.TRPCResponse
    ) =>
      ws.send(
        JSON.stringify(
          TRPCUtilities.transformTRPCResponse(
            state.router._def._config,
            message
          )
        )
      ),

    started: ({ id }: TRPCServerRPC.TRPCClientOutgoingMessage) =>
      send(ws, state).message({ id, result: { type: "started" } }),

    stopped: ({ id }: TRPCServerRPC.TRPCClientOutgoingMessage) =>
      send(ws, state).message({ id, result: { type: "stopped" } }),

    error: ({
      message,
      cause,
    }: {
      message?: TRPCServerRPC.TRPCRequestMessage;
      cause?: TRPCServer.TRPCError | unknown;
    }) =>
      send(ws, state).message({
        id: message?.id,
        error: TRPCUtilities.getErrorShape({
          config: state.router._def._config,
          ctx: state.context,

          type: message?.method ?? "unknown",
          path: message?.params.path,
          input: message?.params.input,

          error:
            cause instanceof TRPCServer.TRPCError
              ? cause
              : new TRPCServer.TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  cause,
                }),
        }),
      }),
  });
}
