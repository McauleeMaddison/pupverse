import { defineConfig } from "vite";

export default defineConfig({
  // Accept the existing Supabase variable names while keeping VITE_* support
  // for standard Vite deployments.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
});

