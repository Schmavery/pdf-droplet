import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// https://vite.dev/config/
export default defineConfig({
  base: "/pdf-droplet/",
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@pdfjs": resolve(__dirname, "./vendor/pdfjs"),
      "@components": resolve(__dirname, "./src/components"),
    },
  },
  plugins: [tailwindcss(), react()],
});
