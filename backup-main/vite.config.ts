// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const deployToCloudflare = process.env.DEPLOY_TARGET === "cloudflare";

export default defineConfig({
  nitro: deployToCloudflare
    ? {
        compatibilityDate: "2024-09-19",
        preset: "cloudflare_module",
        cloudflare: {
          deployConfig: true,
          nodeCompat: true,
          wrangler: {
            name: "technovanza-registration",
          },
        },
      }
    : { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
