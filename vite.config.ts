import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base: the site has to work from a subpath such as GitHub Pages' /<repo>/.
const API_PROXY = { "/api": "http://localhost:8787" };

export default defineConfig({ base: "./", plugins: [react()], server: { proxy: API_PROXY }, preview: { proxy: API_PROXY } });
