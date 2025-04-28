export * as CloudFlare from "@cloudflare/workers-types";

// https://github.com/cloudflare/workers-types/issues/84#issuecomment-909815216
declare global {
  interface CloudFlareWebSocket {
    accept(): unknown;

    addEventListener(
      event: "close",
      callbackFunction: (code?: number, reason?: string) => unknown
    ): unknown;

    addEventListener(
      event: "error",
      callbackFunction: (e: unknown) => unknown
    ): unknown;

    addEventListener(
      event: "message",
      callbackFunction: (event: { data: unknown }) => unknown
    ): unknown;

    /**
     * @param code https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
     * @param reason
     */
    close(code?: number, reason?: string): unknown;
    send(message: string | Uint8Array): unknown;
  }

  class WebSocketPair {
    0: CloudFlareWebSocket;
    1: CloudFlareWebSocket;
  }

  interface ResponseInit {
    webSocket?: CloudFlareWebSocket;
  }
}
