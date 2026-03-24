export type WorkspaceMode = "personal" | "team" | "admin";

export type CanvasNodeType = "text" | "image" | "video" | "audio";

export type TaskStatus =
  | "queued"
  | "dispatched"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type ModuleStage = "foundation" | "core" | "runtime" | "operations";

export type MilestoneStatus = "ready" | "building" | "planned";

export interface OverviewMetric {
  label: string;
  value: string;
  detail: string;
}

export interface CoreModule {
  name: string;
  stage: ModuleStage;
  description: string;
  highlights: string[];
}

export interface ExecutionStep {
  title: string;
  description: string;
}

export interface Milestone {
  phase: string;
  title: string;
  status: MilestoneStatus;
  items: string[];
}

export interface Guardrail {
  label: string;
  detail: string;
}
