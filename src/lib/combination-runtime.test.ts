import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanGovernance,
  deriveProviderCircuitState,
  evaluateSchedulerCapacity,
  expandCombinationItems,
  type CombinationSource,
} from "@/lib/combination-runtime";

function createSource(inputNodeId: string, labels: string[], mappingKeys?: string[]): CombinationSource {
  return {
    inputNodeId,
    inputNodeTitle: `input-${inputNodeId}`,
    sourceType: "text",
    totalItems: labels.length,
    enabledItems: labels.length,
    items: labels.map((label, index) => ({
      inputNodeId,
      inputNodeTitle: `input-${inputNodeId}`,
      itemId: `${inputNodeId}-${index + 1}`,
      stableKey: `${inputNodeId}-${index + 1}`,
      itemLabel: label,
      sourceType: "text" as const,
      contentText: label,
      assetId: null,
      sourceRefJson: mappingKeys?.[index] ? { mappingKey: mappingKeys[index] } : {},
      snapshotJson: {},
      sortOrder: index,
      enabled: true,
    })),
  };
}

test("zip 模式按最短输入源估算组合数", () => {
  const expansion = expandCombinationItems(
    [createSource("a", ["A1", "A2"]), createSource("b", ["B1", "B2", "B3"])],
    {
      mode: "zip",
      anchorInputNodeId: null,
      sampleSize: 3,
    },
    true,
  );

  assert.equal(expansion.estimatedCombinationCount, 2);
  assert.equal(expansion.items?.length, 2);
  assert.deepEqual(
    expansion.items?.map((item) => item.displayLabel),
    ["A1 | B1", "A2 | B2"],
  );
});

test("cartesian 模式展开笛卡尔积", () => {
  const expansion = expandCombinationItems(
    [createSource("a", ["A1", "A2"]), createSource("b", ["B1", "B2"])],
    {
      mode: "cartesian",
      anchorInputNodeId: null,
      sampleSize: 10,
    },
    true,
  );

  assert.equal(expansion.estimatedCombinationCount, 4);
  assert.equal(expansion.items?.length, 4);
  assert.deepEqual(
    expansion.items?.map((item) => item.displayLabel),
    ["A1 | B1", "A1 | B2", "A2 | B1", "A2 | B2"],
  );
});

test("custom_mapping 模式只展开共享 mapping key", () => {
  const expansion = expandCombinationItems(
    [
      createSource("a", ["A1", "A2"], ["sku-1", "sku-2"]),
      createSource("b", ["B1", "B2"], ["sku-2", "sku-3"]),
    ],
    {
      mode: "custom_mapping",
      anchorInputNodeId: null,
      sampleSize: 10,
    },
    true,
  );

  assert.equal(expansion.estimatedCombinationCount, 1);
  assert.equal(expansion.items?.length, 1);
  assert.equal(expansion.items?.[0]?.displayLabel, "A2 | B1");
});

test("视频计划在高成本时返回 manual_approval", () => {
  const governance = buildPlanGovernance({
    estimatedCombinationCount: 90,
    hasVideoTarget: true,
    estimatedVideoTaskCount: 90,
    estimatedPollCost: 90,
  });

  assert.equal(governance.governanceAction, "manual_approval");
  assert.ok(governance.governanceSignals.includes("warn"));
  assert.ok(governance.governanceSignals.includes("confirm"));
  assert.ok(governance.governanceSignals.includes("manual_approval"));
});

test("provider 熔断在连续失败和失败率过高时打开", () => {
  const circuitState = deriveProviderCircuitState({
    recentStatuses: ["failed", "failed", "failed", "failed", "failed", "succeeded", "failed", "failed"],
    minimumSampleSize: 6,
    failureRateThreshold: 0.6,
    consecutiveFailureThreshold: 5,
  });

  assert.equal(circuitState, "open");
});

test("调度容量检查会拦截 workspace 配额和熔断打开", () => {
  const result = evaluateSchedulerCapacity({
    activeShardCount: 1,
    maxActiveShards: 2,
    activeTaskCount: 4,
    maxActiveTasks: 12,
    workspaceActiveTaskCount: 20,
    workspaceTaskQuota: 20,
    mediaPollBacklog: 10,
    mediaPollBacklogLimit: 40,
    providerCircuitState: "open",
  });

  assert.equal(result.allowScheduling, false);
  assert.equal(result.shouldPausePlan, true);
  assert.ok(result.blockingReasons.includes("workspace_task_quota"));
  assert.ok(result.blockingReasons.includes("provider_circuit_open"));
});
