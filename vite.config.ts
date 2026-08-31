import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { puzzleProjectPlugin } from "./src/server/puzzle-project-plugin.ts";

const defaultProject = path.resolve("examples/fox-chicken-grain");
const projectDirectory = path.resolve(
  process.env.PUZZLE_CHART_DIR ?? defaultProject,
);

export default defineConfig({
  base: "./",
  plugins: [react(), puzzleProjectPlugin(projectDirectory)],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
