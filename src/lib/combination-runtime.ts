import { createHash } from "node:crypto";

import { z } from "zod";

export const inputSourceTypeSchema = z.enum(["text", "image", "video"]);
export const combinationModeSchema = z.enum(["zip", "cartesian", "anchor", "custom_mapping"]);
export const governanceActionSchema = z.enum(["warn", "confirm", "manual_approval", "reject"]);
export const providerCircuitStateSchema = z.enum(["closed", "half_open", "open"]);

export type InputSourceType = z.infer<typeof inputSourceTypeSchema>;
export type CombinationMode = z.infer<typeof combinationModeSchema>;
export type GovernanceAction = z.infer<typeof governanceActionSchema>;
export type ProviderCircuitState = z.infer<typeof providerCircuitStateSchema>;

export type CombinationBinding = {
  inputNodeId: string;
  inputNodeTitle: string;
  itemId: string;
  stableKey: string;
  itemLabel: string;
  sourceType: InputSourceType;
  contentText: string | null;
  assetId: string | null;
  sourceRefJson: Record<string, unknown>;
  snapshotJson: Record<string, unknown>;
};

export type CombinationSource = {
  inputNodeId: string;
  inputNodeTitle: string;
  sourceType: InputSourceType;
  totalItems: number;
  enabledItems: number;
  items: Array<
    CombinationBinding & {
      sortOrder: number;
      enabled: boolean;
    }
  >;
};

export type CombinationExpansion = {
  estimatedCombinationCount: number;
  sampleLabels: string[];
  samples: Array<{
    id: string;
    label: string;
    bindings: Array<{
      inputNodeId: string;
      itemId: string;
      itemLabel: string;
      sourceType: InputSourceType;
    }>;
  }>;
  items?: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }>;
};

type GovernanceMetricName = "combination_count" | "video_task_count" | "poll_cost";

type GovernanceMetricThresholds = {
  warn: number;
  confirm: number;
  manualApproval: number;
  reject: number;
};

type CombinationGovernanceThresholdSet = {
  combinationCount: GovernanceMetricThresholds;
  videoTaskCount: GovernanceMetricThresholds;
  pollCost: GovernanceMetricThresholds;
};

type CombinationGovernanceReason = {
  metric: GovernanceMetricName;
  value: number;
  threshold: number;
  action: GovernanceAction;
};

export type PlanGovernanceResult = {
  governanceAction: GovernanceAction | null;
  governanceSignals: GovernanceAction[];
  reasons: CombinationGovernanceReason[];
  metrics: {
    estimatedCombinationCount: number;
    estimatedVideoTaskCount: number;
    estimatedPollCost: number;
  };
  thresholds: CombinationGovernanceThresholdSet;
};

export type SchedulerCapacityResult = {
  allowScheduling: boolean;
  shouldPausePlan: boolean;
  blockingReasons: string[];
  snapshot: {
    activeShardCount: number;
    maxActiveShards: number;
    activeTaskCount: number;
    maxActiveTasks: number;
    workspaceActiveTaskCount: number;
    workspaceTaskQuota: number;
    mediaPollBacklog: number;
    mediaPollBacklogLimit: number;
    providerCircuitState: ProviderCircuitState;
  };
};

const GOVERNANCE_ACTION_ORDER: GovernanceAction[] = ["warn", "confirm", "manual_approval", "reject"];

function mergeThresholds(
  defaults: CombinationGovernanceThresholdSet,
  overrides?: Partial<CombinationGovernanceThresholdSet>,
): CombinationGovernanceThresholdSet {
  if (!overrides) {
    return defaults;
  }

  return {
    combinationCount: {
      ...defaults.combinationCount,
      ...overrides.combinationCount,
    },
    videoTaskCount: {
      ...defaults.videoTaskCount,
      ...overrides.videoTaskCount,
    },
    pollCost: {
      ...defaults.pollCost,
      ...overrides.pollCost,
    },
  };
}

function buildDefaultGovernanceThresholds(hasVideoTarget: boolean): CombinationGovernanceThresholdSet {
  if (hasVideoTarget) {
    return {
      combinationCount: { warn: 8, confirm: 24, manualApproval: 60, reject: 160 },
      videoTaskCount: { warn: 8, confirm: 24, manualApproval: 60, reject: 160 },
      pollCost: { warn: 12, confirm: 30, manualApproval: 80, reject: 200 },
    };
  }

  return {
    combinationCount: { warn: 20, confirm: 80, manualApproval: 200, reject: 500 },
    videoTaskCount: { warn: 50, confirm: 150, manualApproval: 300, reject: 600 },
    pollCost: { warn: 60, confirm: 180, manualApproval: 360, reject: 720 },
  };
}

function pushGovernanceReasons(
  reasons: CombinationGovernanceReason[],
  metric: GovernanceMetricName,
  value: number,
  thresholds: GovernanceMetricThresholds,
) {
  if (value >= thresholds.warn) {
    reasons.push({
      metric,
      value,
      threshold: thresholds.warn,
      action: "warn",
    });
  }

  if (value >= thresholds.confirm) {
    reasons.push({
      metric,
      value,
      threshold: thresholds.confirm,
      action: "confirm",
    });
  }

  if (value >= thresholds.manualApproval) {
    reasons.push({
      metric,
      value,
      threshold: thresholds.manualApproval,
      action: "manual_approval",
    });
  }

  if (value >= thresholds.reject) {
    reasons.push({
      metric,
      value,
      threshold: thresholds.reject,
      action: "reject",
    });
  }
}

export function buildPlanGovernance(input: {
  estimatedCombinationCount: number;
  hasVideoTarget: boolean;
  estimatedVideoTaskCount?: number;
  estimatedPollCost?: number;
  thresholds?: Partial<CombinationGovernanceThresholdSet>;
}): PlanGovernanceResult {
  const thresholds = mergeThresholds(buildDefaultGovernanceThresholds(input.hasVideoTarget), input.thresholds);
  const metrics = {
    estimatedCombinationCount: Math.max(0, Math.trunc(input.estimatedCombinationCount)),
    estimatedVideoTaskCount: Math.max(
      0,
      Math.trunc(input.estimatedVideoTaskCount ?? (input.hasVideoTarget ? input.estimatedCombinationCount : 0)),
    ),
    estimatedPollCost: Math.max(
      0,
      Math.trunc(input.estimatedPollCost ?? (input.hasVideoTarget ? input.estimatedCombinationCount : 0)),
    ),
  };
  const reasons: CombinationGovernanceReason[] = [];

  pushGovernanceReasons(reasons, "combination_count", metrics.estimatedCombinationCount, thresholds.combinationCount);
  pushGovernanceReasons(reasons, "video_task_count", metrics.estimatedVideoTaskCount, thresholds.videoTaskCount);
  pushGovernanceReasons(reasons, "poll_cost", metrics.estimatedPollCost, thresholds.pollCost);

  const signalSet = new Set<GovernanceAction>(reasons.map((reason) => reason.action));
  const governanceSignals = GOVERNANCE_ACTION_ORDER.filter((action) => signalSet.has(action));

  return {
    governanceAction: governanceSignals.at(-1) ?? null,
    governanceSignals,
    reasons,
    metrics,
    thresholds,
  };
}

export function buildCombinationDisplayLabel(bindings: CombinationBinding[]) {
  return bindings.map((binding) => binding.itemLabel).join(" | ");
}

export function buildCombinationStableKey(bindings: CombinationBinding[]) {
  return createHash("sha1")
    .update(bindings.map((binding) => `${binding.inputNodeId}:${binding.stableKey}`).join("|"))
    .digest("hex")
    .slice(0, 24);
}

function sliceSamples(
  items: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }>,
  sampleSize: number,
) {
  const limitedItems = items.slice(0, sampleSize);

  return {
    sampleLabels: limitedItems.map((item) => item.displayLabel),
    samples: limitedItems.map((item) => ({
      id: item.stableKey,
      label: item.displayLabel,
      bindings: item.bindings.map((binding) => ({
        inputNodeId: binding.inputNodeId,
        itemId: binding.itemId,
        itemLabel: binding.itemLabel,
        sourceType: binding.sourceType,
      })),
    })),
  };
}

function expandZipCombinations(sources: CombinationSource[], sampleSize: number, expandAll: boolean): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));
  const estimatedCombinationCount = Math.min(...enabledSources.map((source) => source.items.length));

  if (!Number.isFinite(estimatedCombinationCount) || estimatedCombinationCount <= 0) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const combinations = Array.from(
    { length: expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount) },
    (_, index) => {
      const bindings = enabledSources.map((source) => source.items[index]).filter(Boolean) as CombinationBinding[];

      return {
        stableKey: buildCombinationStableKey(bindings),
        displayLabel: buildCombinationDisplayLabel(bindings),
        bindings,
      };
    },
  );
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function expandAnchorCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
  anchorInputNodeId: string | null,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));
  const anchorSource = enabledSources.find((source) => source.inputNodeId === anchorInputNodeId) ?? enabledSources[0];

  if (!anchorSource || enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const estimatedCombinationCount = anchorSource.items.length;
  const combinations = Array.from(
    { length: expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount) },
    (_, index) => {
      const bindings = enabledSources.map((source) =>
        source.inputNodeId === anchorSource.inputNodeId ? source.items[index] : source.items[index % source.items.length],
      ) as CombinationBinding[];

      return {
        stableKey: buildCombinationStableKey(bindings),
        displayLabel: buildCombinationDisplayLabel(bindings),
        bindings,
      };
    },
  );
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function expandCartesianCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));

  if (enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const estimatedCombinationCount = enabledSources.reduce((total, source) => total * source.items.length, 1);
  const combinations: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }> = [];
  const maxCount = expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount);

  const walk = (depth: number, current: CombinationBinding[]) => {
    if (combinations.length >= maxCount) {
      return;
    }

    if (depth >= enabledSources.length) {
      combinations.push({
        stableKey: buildCombinationStableKey(current),
        displayLabel: buildCombinationDisplayLabel(current),
        bindings: [...current],
      });

      return;
    }

    for (const item of enabledSources[depth].items) {
      current.push(item);
      walk(depth + 1, current);
      current.pop();

      if (combinations.length >= maxCount) {
        return;
      }
    }
  };

  walk(0, []);

  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function resolveCustomMappingKey(item: CombinationSource["items"][number]) {
  const mappingKey = item.sourceRefJson.mappingKey ?? item.sourceRefJson.groupKey ?? item.snapshotJson.mappingKey;

  if (typeof mappingKey === "string" && mappingKey.trim().length > 0) {
    return mappingKey.trim();
  }

  return item.stableKey;
}

function expandCustomMappingCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));

  if (enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const mappingBySource = enabledSources.map((source) => {
    const map = new Map<string, CombinationBinding>();

    for (const item of source.items) {
      const mappingKey = resolveCustomMappingKey(item);

      if (!map.has(mappingKey)) {
        map.set(mappingKey, item);
      }
    }

    return map;
  });
  const sharedKeys = Array.from(mappingBySource[0].keys()).filter((key) => mappingBySource.every((map) => map.has(key)));
  const limitedKeys = sharedKeys.slice(0, expandAll ? sharedKeys.length : sampleSize);
  const combinations = limitedKeys.map((key) => {
    const bindings = mappingBySource.map((map) => map.get(key)).filter(Boolean) as CombinationBinding[];

    return {
      stableKey: buildCombinationStableKey(bindings),
      displayLabel: buildCombinationDisplayLabel(bindings),
      bindings,
    };
  });
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount: sharedKeys.length,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

export function expandCombinationItems(
  sources: CombinationSource[],
  settings: {
    mode: CombinationMode;
    anchorInputNodeId: string | null;
    sampleSize: number;
  },
  expandAll: boolean,
) {
  if (settings.mode === "cartesian") {
    return expandCartesianCombinations(sources, settings.sampleSize, expandAll);
  }

  if (settings.mode === "anchor") {
    return expandAnchorCombinations(sources, settings.sampleSize, expandAll, settings.anchorInputNodeId);
  }

  if (settings.mode === "custom_mapping") {
    return expandCustomMappingCombinations(sources, settings.sampleSize, expandAll);
  }

  return expandZipCombinations(sources, settings.sampleSize, expandAll);
}

export function deriveProviderCircuitState(input: {
  recentStatuses: Array<string | null | undefined>;
  minimumSampleSize: number;
  failureRateThreshold: number;
  consecutiveFailureThreshold: number;
}): ProviderCircuitState {
  const terminalStatuses = input.recentStatuses.filter(
    (status): status is string => status === "succeeded" || status === "failed",
  );

  if (terminalStatuses.length === 0) {
    return "closed";
  }

  let consecutiveFailures = 0;

  for (const status of terminalStatuses) {
    if (status !== "failed") {
      break;
    }

    consecutiveFailures += 1;
  }

  const failedCount = terminalStatuses.filter((status) => status === "failed").length;
  const failureRate = failedCount / terminalStatuses.length;

  if (
    consecutiveFailures >= input.consecutiveFailureThreshold ||
    (terminalStatuses.length >= input.minimumSampleSize && failureRate >= input.failureRateThreshold)
  ) {
    return "open";
  }

  if (failedCount > 0) {
    return "half_open";
  }

  return "closed";
}

export function evaluateSchedulerCapacity(input: {
  activeShardCount: number;
  maxActiveShards: number;
  activeTaskCount: number;
  maxActiveTasks: number;
  workspaceActiveTaskCount: number;
  workspaceTaskQuota: number;
  mediaPollBacklog: number;
  mediaPollBacklogLimit: number;
  providerCircuitState: ProviderCircuitState;
}): SchedulerCapacityResult {
  const blockingReasons: string[] = [];

  if (input.activeShardCount >= input.maxActiveShards) {
    blockingReasons.push("active_shard_limit");
  }

  if (input.activeTaskCount >= input.maxActiveTasks) {
    blockingReasons.push("active_task_limit");
  }

  if (input.workspaceActiveTaskCount >= input.workspaceTaskQuota) {
    blockingReasons.push("workspace_task_quota");
  }

  if (input.mediaPollBacklog >= input.mediaPollBacklogLimit) {
    blockingReasons.push("media_poll_backlog");
  }

  if (input.providerCircuitState === "open") {
    blockingReasons.push("provider_circuit_open");
  }

  return {
    allowScheduling: blockingReasons.length === 0,
    shouldPausePlan: input.providerCircuitState === "open",
    blockingReasons,
    snapshot: {
      activeShardCount: input.activeShardCount,
      maxActiveShards: input.maxActiveShards,
      activeTaskCount: input.activeTaskCount,
      maxActiveTasks: input.maxActiveTasks,
      workspaceActiveTaskCount: input.workspaceActiveTaskCount,
      workspaceTaskQuota: input.workspaceTaskQuota,
      mediaPollBacklog: input.mediaPollBacklog,
      mediaPollBacklogLimit: input.mediaPollBacklogLimit,
      providerCircuitState: input.providerCircuitState,
    },
  };
}
