import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pdfjs": path.resolve(__dirname, "./vendor/pdfjs"),
      "@components": path.resolve(__dirname, "./src/components"),
    },
  },
  plugins: [tailwindcss(), react()],
});
