#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { build, createServer } from "vite";

const [, , command, input = "examples/fox-chicken-grain"] = process.argv;

if (command !== "dev" && command !== "build") {
  console.error("Usage: npm run dev -- <project-folder>\n   or: npm run build -- <project-folder>");
  process.exit(1);
}

process.env.PUZZLE_CHART_DIR = path.resolve(input);

if (command === "dev") {
  const server = await createServer();
  await server.listen();
  server.printUrls();
} else {
  await build();
  console.log(`Built a view-only chart from ${process.env.PUZZLE_CHART_DIR}`);
}
