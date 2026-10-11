import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// `--mode demo` builds the static demo (src/demo): same app, answers recorded from a real server, no server needed.
export default defineConfig(({ mode }) => ({
  root: "src/client",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
  define: { "import.meta.env.VITE_DEMO": JSON.stringify(mode === "demo" ? "1" : "") },
  ...mode === "demo" && { publicDir: "../demo/public" },
  build: { outDir: mode === "demo" ? "../../dist/demo" : "../../dist/client", emptyOutDir: true },
}));
