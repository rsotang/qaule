// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  vite: {
    // Browser-safe Lovable Cloud coordinates. Keep explicit fallbacks because
    // production builds do not always mirror runtime SUPABASE_* bindings into
    // their VITE_* counterparts.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env.VITE_SUPABASE_URL ??
          process.env.SUPABASE_URL ??
          "https://jcjxfmdabkqiygxcjinb.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjanhmbWRhYmtxaXlneGNqaW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTUzOTAsImV4cCI6MjA5NzYzMTM5MH0.dyFT53mRflgDeHGJIqLYELkSapoFnvbYyJtWbChpgYE",
      ),
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
