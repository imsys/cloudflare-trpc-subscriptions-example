import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Output directory relative to project root
    outDir: 'dist',
    // Ensure assets are built for browser environments
    target: 'esnext',
    rollupOptions: {
      input: {
        // Entry point for the client build
        main: './src/Client/index.html', // Use index.html as the entry point
      },
    },
    // Generate sourcemaps for easier debugging
    sourcemap: true,
    // Clean the output directory before building
    emptyOutDir: true,
  },
  // Define the root of your client source code
  root: 'src/Client',
  // Adjust base for correct asset loading if served from a subpath
  base: '/',
  // Configuration for the dev server (optional, as wrangler dev is used)
  server: {
    // Proxy /trpc requests to the wrangler dev server during local Vite dev
    // Not strictly necessary if only using `wrangler dev` which handles everything
    // proxy: {
    //   '/trpc': {
    //     target: 'ws://localhost:8787', // Default wrangler port
    //     ws: true,
    //   },
    // },
  },
});