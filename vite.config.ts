import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "./convex"),
      "@shared": path.resolve(__dirname, "./shared"),
      "convex/_generated": path.resolve(__dirname, "./convex/_generated"),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
