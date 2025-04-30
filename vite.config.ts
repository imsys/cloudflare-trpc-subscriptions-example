import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Define the root of your client source code
  root: resolve(__dirname, 'src/client'),
  // Adjust base for correct asset loading if served from a subpath
  base: "/",

  build: {
    // Output directory relative to project root
    outDir: resolve(__dirname, 'dist'),
    // Ensure assets are built for browser environments
    target: "esnext",
    // rollupOptions: {
    //   input: {
    //     // Entry point for the client build
    //     main: resolve(__dirname, 'src/client/index.html'),
    //   },
    //   output: {
    //     dir: resolve(__dirname, 'dist/client/'),
    //   },
    // },
    // Generate sourcemaps for easier debugging
    sourcemap: true,
    // Clean the output directory before building
    emptyOutDir: true,
  },

  // Configuration for the dev server (optional, as wrangler dev is used)
  server: {
    // Proxy /trpc requests to the wrangler dev server during local Vite dev
    // Not strictly necessary if only using `wrangler dev` which handles everything
    // proxy: {
    //   '/api/trpc': {
    //     target: 'ws://localhost:8787', // Default wrangler port
    //     //changeOrigin: true,
    //     ws: true,
    //   },
    // },
  },
  plugins: [
    cloudflare({
      configPath: resolve(__dirname, 'wrangler.jsonc'),
      persistState: {
        path: resolve(__dirname, '.wrangler/state'),
      },
    })
  ],
});
