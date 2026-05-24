import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"

const viewerEntry = fileURLToPath(new URL("./viewer.html", import.meta.url))
const reactPath = fileURLToPath(new URL("./node_modules/react", import.meta.url))
const reactDomPath = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url))
const outDir = process.env.GAMECULT_GRAPH_SPA_OUT_DIR
  ? path.resolve(process.env.GAMECULT_GRAPH_SPA_OUT_DIR)
  : fileURLToPath(new URL("./dist", import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: reactPath,
      "react-dom": reactDomPath,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4182,
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        viewer: viewerEntry,
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          elk: ["elkjs/lib/elk.bundled.js"],
        },
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
})
