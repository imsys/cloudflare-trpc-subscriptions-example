import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
// Assuming your root router type is exported from TRPC/index.ts
// You might need to adjust the import path and ensure AppRouter is exported
import type { AppRouter } from '../'; // Adjust path if needed
import { SuperJSON } from "superjson";

import { basePath } from "../API";

// Function to get the WebSocket URL based on the current page's protocol and host
function getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Assuming your WebSocket endpoint is handled at /trpc by the worker/DO
    const path = `${basePath}/trpc`; // '/api/trpc';
    return `${protocol}//${host}${path}`;
}

// Get the output div
const outputDiv = document.getElementById('output');

function log(message: string) {
    console.log(message);
    if (outputDiv) {
        const p = document.createElement('p');
        p.textContent = message;
        outputDiv.appendChild(p);
        // Auto-scroll
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }
}

// Create WebSocket client
const wsClient = createWSClient({
    url: getWebSocketUrl(),
    onOpen: async () => {
        log('WebSocket connection opened.');

        try {
            log('Calling sandbox.hello query...');
            const result = await trpc.sandbox.hello.query();
            log(`sandbox.hello query result: "${result}"`);
        } catch (error) {
            log(`Error calling sandbox.hello: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error('Error calling sandbox.hello:', error);
        }

    },
    onClose: () => {
        log('WebSocket connection closed.');
         // Ensure subscription is marked as stopped if WS closes unexpectedly
         // Note: Accessing internal flags like 'closed' is brittle.
         // Consider relying on onStopped or onError in the subscription itself.
         // However, if you explicitly need cleanup on WS close:
         if (subscription && typeof subscription.unsubscribe === 'function') {
             // Check if subscription exists and has unsubscribe method
             log('Attempting to unsubscribe due to WS close.');
             subscription.unsubscribe(); // Attempt to clean up tRPC state
         }
    },
    onError: (err) => {
        // The err object here might be a generic Event or Error,
        // depending on the WebSocket implementation and the error type.
        // You might need more specific error handling depending on the cause.
        const message = err instanceof Error ? err.message : 'Unknown WebSocket error';
        log(`WebSocket Client Error: ${message}`);
        console.error('WebSocket Client Error:', err);
        // Optionally, you might want to trigger subscription cleanup here too,
        // although the subscription's onError should also handle failures.
        if (subscription && typeof subscription.unsubscribe === 'function') {
            log('Attempting to unsubscribe due to WS error.');
            subscription.unsubscribe();
        }
    },
});

// Create tRPC client
const trpc = createTRPCClient<AppRouter>({
    links: [
        wsLink({
            client: wsClient,
            transformer: SuperJSON
        }),
    ],
});

log(`Connecting to: ${getWebSocketUrl()}`);

let subscription: ReturnType<typeof trpc.sandbox.subscribe.subscribe> | null = null;

// Subscribe to the sandbox endpoint
subscription = trpc.sandbox.subscribe.subscribe(undefined, {
    onStarted: () => {
        log('Subscription started.');
        if (outputDiv) {
            //outputDiv.innerHTML = ''; // Clear "Waiting..." message
        }
    },
    onData: (data: any) => {
        // Assuming data is a Date object based on Sandbox/index.ts
        log(`Received data: ${data instanceof Date ? data.toISOString() : JSON.stringify(data)}`);
    },
    onError: (err) => {
        log(`Subscription error: ${err.message}`);
        console.error("Subscription error:", err);
        //wsClient.close(); // Close WS connection on error
    },
    onStopped: () => {
        log('Subscription stopped.');
    },
    // `onComplete` is also available if the subscription finishes naturally
    // onComplete: () => {
    //     log('Subscription completed.');
    // },
    onComplete: () => {
        log('Subscription completed (stream finished).');
   },
});

// Optional: Close the WebSocket connection when the page is unloaded
window.addEventListener('beforeunload', () => {
    log('Page unloading, stopping subscription...');
    if (subscription) {
        subscription.unsubscribe();
    }
    wsClient.close();
});

