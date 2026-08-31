import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  loadPuzzleProject,
  saveGraphLayout,
  savePuzzleDocument,
  savePuzzleGraph,
} from "./project-files.ts";

const endpoint = "/__pdc";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 5_000_000) {
      throw new Error("Request is too large.");
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown project error";
}

export function puzzleProjectPlugin(projectRoot: string): Plugin {
  return {
    name: "puzzle-project-files",

    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://puzzle-chart.local");
        if (!url.pathname.startsWith(endpoint)) {
          next();
          return;
        }

        try {
          if (request.method === "GET" && url.pathname === `${endpoint}/project`) {
            sendJson(response, 200, await loadPuzzleProject(projectRoot, true));
            return;
          }

          if (
            request.method === "PUT" &&
            url.pathname === `${endpoint}/document`
          ) {
            const body = (await readJson(request)) as {
              path?: unknown;
              markdown?: unknown;
            };
            if (typeof body.path !== "string" || typeof body.markdown !== "string") {
              throw new Error("A document path and Markdown string are required.");
            }
            await savePuzzleDocument(projectRoot, body.path, body.markdown);
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === "PUT" && url.pathname === `${endpoint}/layout`) {
            const body = (await readJson(request)) as { layout?: unknown };
            const layout = await saveGraphLayout(projectRoot, body.layout);
            sendJson(response, 200, { ok: true, layout });
            return;
          }

          if (request.method === "PUT" && url.pathname === `${endpoint}/graph`) {
            const body = (await readJson(request)) as {
              graph?: unknown;
              documents?: unknown;
            };
            const documents: Record<string, string> = {};
            if (body.documents !== undefined) {
              if (
                !body.documents ||
                typeof body.documents !== "object" ||
                Array.isArray(body.documents)
              ) {
                throw new Error("Initial documents must be a path-to-Markdown object.");
              }
              for (const [documentPath, markdown] of Object.entries(
                body.documents as Record<string, unknown>,
              )) {
                if (typeof markdown !== "string") {
                  throw new Error(`Initial document ${documentPath} must be Markdown.`);
                }
                documents[documentPath] = markdown;
              }
            }
            const graph = await savePuzzleGraph(
              projectRoot,
              body.graph,
              documents,
            );
            sendJson(response, 200, { ok: true, graph });
            return;
          }

          if (request.method === "PUT" && url.pathname === `${endpoint}/state`) {
            const body = (await readJson(request)) as {
              graph?: unknown;
              layout?: unknown;
              documents?: unknown;
            };
            const documents: Record<string, string> = {};
            if (body.documents !== undefined) {
              if (
                !body.documents ||
                typeof body.documents !== "object" ||
                Array.isArray(body.documents)
              ) {
                throw new Error("Initial documents must be a path-to-Markdown object.");
              }
              for (const [documentPath, markdown] of Object.entries(
                body.documents as Record<string, unknown>,
              )) {
                if (typeof markdown !== "string") {
                  throw new Error(`Initial document ${documentPath} must be Markdown.`);
                }
                documents[documentPath] = markdown;
              }
            }
            const result: Record<string, unknown> = { ok: true };
            if (body.graph !== undefined) {
              result.graph = await savePuzzleGraph(
                projectRoot,
                body.graph,
                documents,
              );
            }
            if (body.layout !== undefined) {
              result.layout = await saveGraphLayout(projectRoot, body.layout);
            }
            if (body.graph === undefined && body.layout === undefined) {
              throw new Error("A graph or layout update is required.");
            }
            sendJson(response, 200, result);
            return;
          }

          sendJson(response, 404, { error: "Unknown puzzle chart endpoint." });
        } catch (error) {
          sendJson(response, 400, { error: messageFrom(error) });
        }
      });
    },

    async generateBundle() {
      const project = await loadPuzzleProject(projectRoot, false);
      this.emitFile({
        type: "asset",
        fileName: "project-data.json",
        source: JSON.stringify(project),
      });
    },
  };
}
