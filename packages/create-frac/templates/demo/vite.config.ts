import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { frac } from "@usefractal/frac/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [frac(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
