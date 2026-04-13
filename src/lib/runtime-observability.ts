type RuntimeLogLevel = "info" | "warn" | "error";

type RuntimeMetricEntry = {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
  fields?: Record<string, unknown>;
  timestamp: string;
};

type RuntimeLogEntry = {
  level: RuntimeLogLevel;
  event: string;
  message?: string;
  requestId?: string;
  workspaceId?: string;
  canvasId?: string | null;
  planId?: string | null;
  shardId?: string | null;
  combinationItemId?: string | null;
  nodeId?: string | null;
  nodeRunId?: string | null;
  taskId?: string | null;
  provider?: string | null;
  model?: string | null;
  status?: string | null;
  details?: Record<string, unknown>;
  timestamp: string;
};

const MAX_METRIC_BUFFER_SIZE = 500;
const metricBuffer: RuntimeMetricEntry[] = [];

function shouldEmitStructuredLog() {
  const raw = process.env.ENABLE_STRUCTURED_LOG?.trim().toLowerCase();

  if (!raw) {
    return process.env.NODE_ENV !== "test";
  }

  return ["1", "true", "yes", "on"].includes(raw);
}

function shouldBufferMetrics() {
  const raw = process.env.METRICS_ENABLED?.trim().toLowerCase();

  if (!raw) {
    return true;
  }

  return ["1", "true", "yes", "on"].includes(raw);
}

export function logRuntimeEvent(input: Omit<RuntimeLogEntry, "timestamp">) {
  const entry: RuntimeLogEntry = {
    ...input,
    timestamp: new Date().toISOString(),
  };

  if (shouldEmitStructuredLog()) {
    const serialized = JSON.stringify(entry);

    if (input.level === "error") {
      console.error(serialized);
    } else if (input.level === "warn") {
      console.warn(serialized);
    } else {
      console.info(serialized);
    }
  }

  return entry;
}

export function recordRuntimeMetric(input: Omit<RuntimeMetricEntry, "timestamp">) {
  const entry: RuntimeMetricEntry = {
    ...input,
    timestamp: new Date().toISOString(),
  };

  if (shouldBufferMetrics()) {
    metricBuffer.push(entry);

    if (metricBuffer.length > MAX_METRIC_BUFFER_SIZE) {
      metricBuffer.shift();
    }
  }

  return entry;
}

export function getRuntimeMetricBuffer() {
  return [...metricBuffer];
}

export function resetRuntimeMetricBuffer() {
  metricBuffer.length = 0;
}
