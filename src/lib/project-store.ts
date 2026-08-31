import {
  clearLocalDraft,
  editableDraftFrom,
  loadLocalDraft,
  saveLocalDraft,
} from "./local-draft";
import type {
  GraphLayout,
  PuzzleGraph,
  PuzzleProject,
} from "./project-types";

export interface ProjectUpdate {
  graph?: PuzzleGraph;
  layout?: GraphLayout;
  documents?: Record<string, string>;
}

export interface ProjectLoadResult {
  project: PuzzleProject;
  persisted: boolean;
}

export interface ProjectStore {
  readonly kind: "source" | "published" | "local-draft";
  readonly writable: boolean;
  load(): Promise<ProjectLoadResult>;
  save(snapshot: PuzzleProject, update: ProjectUpdate): Promise<void>;
  reset?(): Promise<void>;
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

abstract class FetchProjectStore implements ProjectStore {
  abstract readonly kind: "source" | "published";
  abstract readonly writable: boolean;

  constructor(private readonly projectUrl: string) {}

  async load(): Promise<ProjectLoadResult> {
    const response = await fetch(this.projectUrl);
    if (!response.ok) throw await responseError(response);
    return {
      project: (await response.json()) as PuzzleProject,
      persisted: true,
    };
  }

  abstract save(snapshot: PuzzleProject, update: ProjectUpdate): Promise<void>;
}

export class SourceProjectStore extends FetchProjectStore {
  readonly kind = "source" as const;
  readonly writable = true;

  async save(_snapshot: PuzzleProject, update: ProjectUpdate): Promise<void> {
    const response = await fetch("/__pdc/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!response.ok) throw await responseError(response);
  }
}

export class PublishedProjectStore extends FetchProjectStore {
  readonly kind = "published" as const;
  readonly writable = false;

  async save(): Promise<void> {
    throw new Error("The published project is read-only.");
  }
}

export class IndexedDbProjectStore implements ProjectStore {
  readonly kind = "local-draft" as const;
  readonly writable = true;

  constructor(
    private readonly key: string,
    private readonly baseline: PuzzleProject,
  ) {}

  async load(): Promise<ProjectLoadResult> {
    const stored = await loadLocalDraft(this.key, this.baseline);
    return {
      project: stored?.project ?? editableDraftFrom(this.baseline),
      persisted: Boolean(stored),
    };
  }

  async save(snapshot: PuzzleProject, _update: ProjectUpdate): Promise<void> {
    await saveLocalDraft(this.key, snapshot);
  }

  async reset(): Promise<void> {
    await clearLocalDraft(this.key);
  }
}

export function createInitialProjectStore(
  projectUrl: string,
  development: boolean,
): ProjectStore {
  return development
    ? new SourceProjectStore(projectUrl)
    : new PublishedProjectStore(projectUrl);
}
