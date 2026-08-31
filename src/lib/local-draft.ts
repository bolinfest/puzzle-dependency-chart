import {
  parseGraph,
  parseLayout,
  type PuzzleProject,
  validateProjectDocumentPath,
} from "./project-types";
import { hydrateGraphTodoEffects } from "./todo-markdown";

const databaseName = "puzzle-dependency-chart";
const databaseVersion = 1;
const storeName = "local-drafts";

interface StoredLocalDraft {
  key: string;
  version: 1;
  updatedAt: string;
  project: PuzzleProject;
}

export interface LoadedLocalDraft {
  project: PuzzleProject;
  updatedAt: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open browser draft storage."));
  });
}

function documentsFrom(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local draft documents are invalid.");
  }
  const documents: Record<string, string> = {};
  for (const [path, markdown] of Object.entries(value)) {
    validateProjectDocumentPath(path, "Local draft document path");
    if (typeof markdown !== "string") {
      throw new Error(`Local draft document ${path} is not Markdown text.`);
    }
    documents[path] = markdown;
  }
  return documents;
}

function normalizedProject(
  value: unknown,
  projectName: string,
  writable: boolean,
): PuzzleProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local draft project is invalid.");
  }
  const source = value as Partial<PuzzleProject>;
  const documents = documentsFrom(source.documents);
  const graph = hydrateGraphTodoEffects(parseGraph(source.graph), documents);
  for (const node of graph.nodes) {
    if (!(node.document in documents)) {
      throw new Error(`Local draft is missing ${node.document}.`);
    }
  }
  return {
    projectName,
    graph,
    layout: parseLayout(source.layout),
    documents,
    writable,
  };
}

function normalizeStoredDraft(
  value: unknown,
  baseline: PuzzleProject,
): LoadedLocalDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Partial<StoredLocalDraft>;
  if (record.version !== 1 || typeof record.updatedAt !== "string") return;
  if (!record.project || typeof record.project !== "object") return;
  return {
    updatedAt: record.updatedAt,
    project: normalizedProject(record.project, baseline.projectName, true),
  };
}

export function localDraftKey(
  project: PuzzleProject,
  pagePath: string,
): string {
  return `${pagePath}:${project.projectName}`;
}

export function editableDraftFrom(project: PuzzleProject): PuzzleProject {
  return {
    projectName: project.projectName,
    graph: structuredClone(project.graph),
    layout: structuredClone(project.layout),
    documents: structuredClone(project.documents),
    writable: true,
  };
}

export async function loadLocalDraft(
  key: string,
  baseline: PuzzleProject,
): Promise<LoadedLocalDraft | undefined> {
  const database = await openDraftDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const value = await requestResult(transaction.objectStore(storeName).get(key));
    return normalizeStoredDraft(value, baseline);
  } finally {
    database.close();
  }
}

export async function saveLocalDraft(
  key: string,
  project: PuzzleProject,
): Promise<string> {
  const updatedAt = new Date().toISOString();
  const validatedProject = normalizedProject(
    project,
    project.projectName,
    false,
  );
  const database = await openDraftDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({
      key,
      version: 1,
      updatedAt,
      project: validatedProject,
    } satisfies StoredLocalDraft);
    await transactionComplete(transaction);
    return updatedAt;
  } finally {
    database.close();
  }
}

export async function clearLocalDraft(key: string): Promise<void> {
  const database = await openDraftDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
