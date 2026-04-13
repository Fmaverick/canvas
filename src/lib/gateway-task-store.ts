type GatewayTaskStatus = "queued" | "processing" | "succeeded" | "failed" | "canceled";

type GatewayTaskOutput = {
  kind: "url";
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

type GatewayTaskRecord = {
  id: string;
  modality: "video";
  model: string;
  provider: string;
  status: GatewayTaskStatus;
  providerTaskId: string;
  output: GatewayTaskOutput[];
  error: {
    code: string;
    message: string;
  } | null;
  providerTask: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
};

const TASK_STORE_GLOBAL = "__gateway_task_store__";

type GatewayTaskState = {
  tasks: Map<string, GatewayTaskRecord>;
};

function getState() {
  const globalRef = globalThis as typeof globalThis & {
    [TASK_STORE_GLOBAL]?: GatewayTaskState;
  };

  if (!globalRef[TASK_STORE_GLOBAL]) {
    globalRef[TASK_STORE_GLOBAL] = {
      tasks: new Map<string, GatewayTaskRecord>(),
    };
  }

  return globalRef[TASK_STORE_GLOBAL]!;
}

export function createGatewayVideoTask(input: {
  model: string;
  provider: string;
  providerTaskId: string;
  status: GatewayTaskStatus;
  providerTask?: Record<string, unknown>;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const task: GatewayTaskRecord = {
    id,
    modality: "video",
    model: input.model,
    provider: input.provider,
    providerTaskId: input.providerTaskId,
    status: input.status,
    output: [],
    error: null,
    providerTask: input.providerTask ?? {},
    createdAt: now,
    updatedAt: now,
  };
  getState().tasks.set(id, task);
  return { ...task };
}

export function getGatewayTask(taskId: string) {
  const task = getState().tasks.get(taskId);
  return task ? { ...task } : null;
}

export function updateGatewayTask(
  taskId: string,
  patch: Partial<Omit<GatewayTaskRecord, "id" | "createdAt" | "updatedAt">>,
) {
  const state = getState();
  const current = state.tasks.get(taskId);

  if (!current) {
    return null;
  }

  const next: GatewayTaskRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  state.tasks.set(taskId, next);
  return { ...next };
}
