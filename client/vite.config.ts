import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, ".."); // project root

export default defineConfig({
  plugins: [react()],
  root: "./client",
  resolve: {
    // make sure any import resolves to the SAME instance
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: {
      react: path.resolve(ROOT, "node_modules/react"),
      "react-dom": path.resolve(ROOT, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(ROOT, "node_modules/react/jsx-runtime.js")
    }
  },
  server: {
    port: Number(process.env.CLIENT_PORT) || 5173,
    proxy: {
      "/auth": "http://localhost:4000",
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000"
    }
  }
});
