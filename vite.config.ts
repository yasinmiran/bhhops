import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base: the site has to work from a subpath such as GitHub Pages' /<repo>/.
export default defineConfig({ base: "./", plugins: [react()] });
