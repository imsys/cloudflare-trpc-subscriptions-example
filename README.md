
Fork from [cruhl/cloudflare-trpc-subscriptions-example](https://github.com/cruhl/cloudflare-trpc-subscriptions-example).

This is an example of using Hono and TRPC on Cloudflare Durable Objects using the Websockets Hibernation API.

I tried to simplify the code, and make it "just run" with TRPC v11.

The changes were done mostly by Gemini. There is still a lot of things that could be simplified, but I'm publishing it as it currently is to help others.

# How to run & test

1. `npm install`

2. `npm run cf-typegen` after each change in `wrangler.jsonc`

3. Ctrl+Shift+P -> `typescript.restartTsServer` - Restart TypeScript Server if necessary

4. `npm run dev` to do a local test.