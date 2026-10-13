import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// `vite build` emits one self-contained index.html for the preview artifact.
export default defineConfig({
  plugins: [react(), viteSingleFile()]
})
