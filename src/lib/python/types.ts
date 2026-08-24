export type RunnerStatus = "booting" | "installing" | "ready" | "running" | "error";

export type RunnerImage = { name: string; bytes: ArrayBuffer };

export type RunnerToParent =
  | { type: "status"; status: RunnerStatus; detail?: string }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "done"; ok: boolean; error?: string; images: RunnerImage[] }
  | { type: "pong" };

export type RunnerFile = { name: string; bytes: ArrayBuffer };

export type ParentToRunner =
  { type: "ping" } | { type: "run"; code: string; context: unknown; files: RunnerFile[] };

export const RUNNER_PATH = "/python-runner";
