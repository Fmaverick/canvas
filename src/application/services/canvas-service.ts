import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { assets, canvasEdges, canvasNodes, canvases, generationTasks, nodeRuns, taskResults } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";
import { notifyCanvasRuntimeChanged } from "@/lib/canvas-runtime-events";

type CanvasNodeRecord = typeof canvasNodes.$inferSelect;
type CanvasEdgeRecord = typeof canvasEdges.$inferSelect;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DatabaseExecutor = typeof db | DatabaseTransaction;

async function deleteNodeRuntimeRecords(
  executor: DatabaseTransaction,
  input: {
    workspaceId: string;
    canvasId: string;
    nodeId: string;
  },
) {
  const relatedTasks = await executor
    .select({
      id: generationTasks.id,
    })
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.workspaceId, input.workspaceId),
        eq(generationTasks.canvasId, input.canvasId),
        eq(generationTasks.nodeId, input.nodeId),
      ),
    );
  const taskIds = relatedTasks.map((task) => task.id);

  if (taskIds.length > 0) {
    await executor
      .delete(taskResults)
      .where(and(eq(taskResults.workspaceId, input.workspaceId), inArray(taskResults.taskId, taskIds)));

    await executor
      .delete(generationTasks)
      .where(
        and(
          eq(generationTasks.workspaceId, input.workspaceId),
          eq(generationTasks.canvasId, input.canvasId),
          eq(generationTasks.nodeId, input.nodeId),
        ),
      );
  }

  await executor
    .delete(nodeRuns)
    .where(
      and(
        eq(nodeRuns.workspaceId, input.workspaceId),
        eq(nodeRuns.canvasId, input.canvasId),
        eq(nodeRuns.nodeId, input.nodeId),
      ),
    );
}

export const listCanvasesInputSchema = z.object({
  workspaceId: z.uuid(),
});

export const getCanvasDetailInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
});

export const createCanvasInputSchema = z.object({
  workspaceId: z.uuid(),
  createdBy: z.uuid(),
  name: z.string().min(1, "Canvas name is required."),
  description: z.string().trim().optional(),
});

const resourceRefsSchema = z.object({
  subjectIds: z.array(z.uuid()).default([]),
  sceneIds: z.array(z.uuid()).default([]),
  instructionPresetIds: z.array(z.uuid()).default([]),
  assetIds: z.array(z.uuid()).default([]),
});

export const createNodeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  createdBy: z.uuid(),
  type: z.enum(["text", "image", "video", "audio", "storyboard"]),
  title: z.string().min(1, "Node title is required."),
  promptInput: z.string().trim().optional(),
  outputSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  modelKey: z.string().trim().optional(),
  settingsJson: z.record(z.string(), z.unknown()).default({}),
  resourceRefs: resourceRefsSchema.default({
    subjectIds: [],
    sceneIds: [],
    instructionPresetIds: [],
    assetIds: [],
  }),
  positionX: z.coerce.number().default(0),
  positionY: z.coerce.number().default(0),
});

export const updateNodeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  title: z.string().min(1).optional(),
  promptInput: z.string().trim().nullable().optional(),
  outputSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  modelKey: z.string().trim().nullable().optional(),
  settingsJson: z.record(z.string(), z.unknown()).nullable().optional(),
  resourceRefs: resourceRefsSchema.optional(),
  positionX: z.coerce.number().optional(),
  positionY: z.coerce.number().optional(),
  status: z.enum(["idle", "queued", "processing", "succeeded", "failed"]).optional(),
});

export const deleteNodeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
});

export const createEdgeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  sourceNodeId: z.uuid(),
  targetNodeId: z.uuid(),
  mergeMode: z.enum(["previous_only", "merge_all", "custom"]),
  priority: z.coerce.number().int().default(0),
});

export const deleteEdgeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  edgeId: z.uuid(),
});

const nodePatchSchema = updateNodeInputSchema.omit({
  workspaceId: true,
  canvasId: true,
  nodeId: true,
});

const graphNodeCreateSchema = createNodeInputSchema.omit({
  workspaceId: true,
  canvasId: true,
  createdBy: true,
});

const graphEdgeCreateSchema = createEdgeInputSchema
  .omit({
    workspaceId: true,
    canvasId: true,
    sourceNodeId: true,
    targetNodeId: true,
  })
  .extend({
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
  });

const patchCanvasGraphOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move_nodes"),
    updates: z.array(
      z.object({
        nodeId: z.uuid(),
        positionX: z.coerce.number(),
        positionY: z.coerce.number(),
      }),
    ),
  }),
  z.object({
    type: z.literal("update_node"),
    nodeId: z.uuid(),
    patch: nodePatchSchema,
  }),
  z.object({
    type: z.literal("create_node"),
    clientId: z.string().min(1).optional(),
    node: graphNodeCreateSchema,
  }),
  z.object({
    type: z.literal("delete_node"),
    nodeId: z.uuid(),
  }),
  z.object({
    type: z.literal("create_edge"),
    edge: graphEdgeCreateSchema,
  }),
  z.object({
    type: z.literal("delete_edge"),
    edgeId: z.uuid(),
  }),
]);

export const patchCanvasGraphInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  actorId: z.uuid(),
  baseVersion: z.coerce.number().int().min(1),
  operations: z.array(patchCanvasGraphOperationSchema).min(1),
});

async function assertCanvasExistsWithExecutor(executor: DatabaseExecutor, workspaceId: string, canvasId: string) {
  const [canvas] = await executor
    .select()
    .from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.workspaceId, workspaceId)))
    .limit(1);

  if (!canvas) {
    throw new ApiError(404, "CANVAS_NOT_FOUND", "Canvas not found.");
  }

  return canvas;
}

async function assertCanvasExists(workspaceId: string, canvasId: string) {
  return assertCanvasExistsWithExecutor(db, workspaceId, canvasId);
}

async function assertNodeExistsWithExecutor(
  executor: DatabaseExecutor,
  workspaceId: string,
  canvasId: string,
  nodeId: string,
) {
  const [node] = await executor
    .select()
    .from(canvasNodes)
    .where(
      and(
        eq(canvasNodes.id, nodeId),
        eq(canvasNodes.canvasId, canvasId),
        eq(canvasNodes.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
  }

  return node;
}

async function assertNodeExists(workspaceId: string, canvasId: string, nodeId: string) {
  return assertNodeExistsWithExecutor(db, workspaceId, canvasId, nodeId);
}

async function assertEdgeExistsWithExecutor(executor: DatabaseExecutor, workspaceId: string, canvasId: string, edgeId: string) {
  const [edge] = await executor
    .select()
    .from(canvasEdges)
    .where(
      and(
        eq(canvasEdges.id, edgeId),
        eq(canvasEdges.canvasId, canvasId),
        eq(canvasEdges.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!edge) {
    throw new ApiError(404, "EDGE_NOT_FOUND", "Canvas edge not found.");
  }

  return edge;
}

async function assertEdgeExists(workspaceId: string, canvasId: string, edgeId: string) {
  return assertEdgeExistsWithExecutor(db, workspaceId, canvasId, edgeId);
}

function normalizeVideoSettingsForClient(settingsJson: Record<string, unknown> | null | undefined) {
  if (!settingsJson || typeof settingsJson !== "object") {
    return {};
  }

  const currentSize = settingsJson.size;

  if (currentSize === "9:16" || currentSize === "16:9" || currentSize === "1:1") {
    return settingsJson;
  }

  return {
    ...settingsJson,
    size: "9:16",
  };
}

function assertNoCycle(
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
  sourceNodeId: string,
  targetNodeId: string,
) {
  if (sourceNodeId === targetNodeId) {
    throw new ApiError(409, "NODE_GRAPH_INVALID", "Canvas edge cannot connect a node to itself.");
  }

  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const current = adjacency.get(edge.sourceNodeId) ?? [];
    current.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, current);
  }

  const queue = [targetNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    if (currentNodeId === sourceNodeId) {
      throw new ApiError(409, "NODE_GRAPH_INVALID", "Canvas graph cannot form a cycle.");
    }

    visited.add(currentNodeId);

    for (const nextNodeId of adjacency.get(currentNodeId) ?? []) {
      queue.push(nextNodeId);
    }
  }
}

async function hydrateCanvasNodes(workspaceId: string, nodes: CanvasNodeRecord[]) {
  if (nodes.length === 0) {
    return [];
  }

  const referencedAssetIds = Array.from(
    new Set(
      nodes.flatMap((node) => {
        const resourceRefs = node.resourceRefs as { assetIds?: string[] } | null;

        return (resourceRefs?.assetIds ?? []).filter((assetId): assetId is string => typeof assetId === "string");
      }),
    ),
  );
  const referenceAssets =
    referencedAssetIds.length > 0
      ? await db
          .select({
            id: assets.id,
            fileName: assets.fileName,
            fileUrl: assets.fileUrl,
            mimeType: assets.mimeType,
            width: assets.width,
            height: assets.height,
          })
          .from(assets)
          .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, referencedAssetIds)))
      : [];
  const referenceAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset]));

  return nodes.map((node) => {
    const resourceRefs = node.resourceRefs as { assetIds?: string[] } | null;
    const assetIds = (resourceRefs?.assetIds ?? []).filter((assetId): assetId is string => typeof assetId === "string");

    return {
      ...node,
      settingsJson:
        node.type === "video"
          ? normalizeVideoSettingsForClient(node.settingsJson as Record<string, unknown> | null | undefined)
          : node.settingsJson,
      referenceAssets: assetIds
        .map((assetId) => referenceAssetMap.get(assetId))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
    };
  });
}

function buildNodeUpdateValues(patch: z.infer<typeof nodePatchSchema>) {
  const normalizedSettingsJson =
    patch.settingsJson === undefined ? undefined : patch.settingsJson === null ? {} : patch.settingsJson;

  return {
    title: patch.title,
    promptInput: patch.promptInput === undefined ? undefined : patch.promptInput,
    outputSnapshot: patch.outputSnapshot === undefined ? undefined : patch.outputSnapshot,
    modelKey: patch.modelKey === undefined ? undefined : patch.modelKey,
    settingsJson: normalizedSettingsJson,
    resourceRefs: patch.resourceRefs,
    positionX: patch.positionX === undefined ? undefined : String(patch.positionX),
    positionY: patch.positionY === undefined ? undefined : String(patch.positionY),
    status: patch.status,
    updatedAt: new Date(),
  };
}

function resolveNodeReference(
  reference: string,
  nodeById: Map<string, CanvasNodeRecord>,
  createdNodeByClientId: Map<string, CanvasNodeRecord>,
) {
  const createdNode = createdNodeByClientId.get(reference);

  if (createdNode) {
    return createdNode.id;
  }

  if (nodeById.has(reference)) {
    return reference;
  }

  throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
}

export async function listCanvases(input: z.infer<typeof listCanvasesInputSchema>) {
  const parsed = listCanvasesInputSchema.parse(input);

  return db
    .select()
    .from(canvases)
    .where(eq(canvases.workspaceId, parsed.workspaceId))
    .orderBy(desc(canvases.updatedAt));
}

export async function createCanvas(input: z.infer<typeof createCanvasInputSchema>) {
  const parsed = createCanvasInputSchema.parse(input);

  const [canvas] = await db
    .insert(canvases)
    .values({
      workspaceId: parsed.workspaceId,
      createdBy: parsed.createdBy,
      name: parsed.name,
      description: parsed.description,
      status: "draft",
      version: 1,
    })
    .returning();

  return canvas;
}

export async function getCanvasDetail(input: z.infer<typeof getCanvasDetailInputSchema>) {
  const parsed = getCanvasDetailInputSchema.parse(input);
  const canvas = await assertCanvasExists(parsed.workspaceId, parsed.canvasId);

  const [nodes, edges] = await Promise.all([
    db
      .select()
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.canvasId, parsed.canvasId),
          eq(canvasNodes.workspaceId, parsed.workspaceId),
        ),
      )
      .orderBy(desc(canvasNodes.updatedAt)),
    db
      .select()
      .from(canvasEdges)
      .where(
        and(
          eq(canvasEdges.canvasId, parsed.canvasId),
          eq(canvasEdges.workspaceId, parsed.workspaceId),
        ),
      )
      .orderBy(desc(canvasEdges.createdAt)),
  ]);

  return {
    ...canvas,
    nodes: await hydrateCanvasNodes(parsed.workspaceId, nodes),
    edges,
  };
}

export async function createNode(input: z.infer<typeof createNodeInputSchema>) {
  const parsed = createNodeInputSchema.parse(input);
  await assertCanvasExists(parsed.workspaceId, parsed.canvasId);

  const [node] = await db
    .insert(canvasNodes)
    .values({
      canvasId: parsed.canvasId,
      workspaceId: parsed.workspaceId,
      type: parsed.type,
      title: parsed.title,
      createdBy: parsed.createdBy,
      promptInput: parsed.promptInput,
      outputSnapshot: parsed.outputSnapshot,
      modelKey: parsed.modelKey,
      settingsJson: parsed.settingsJson,
      resourceRefs: parsed.resourceRefs,
      status: "idle",
      positionX: String(parsed.positionX),
      positionY: String(parsed.positionY),
    })
    .returning();

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "create_node",
  });

  return node;
}

export async function updateNode(input: z.infer<typeof updateNodeInputSchema>) {
  const parsed = updateNodeInputSchema.parse(input);
  await assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  const normalizedSettingsJson =
    parsed.settingsJson === undefined ? undefined : parsed.settingsJson === null ? {} : parsed.settingsJson;

  const [node] = await db
    .update(canvasNodes)
    .set({
      title: parsed.title,
      promptInput: parsed.promptInput === undefined ? undefined : parsed.promptInput,
      outputSnapshot: parsed.outputSnapshot === undefined ? undefined : parsed.outputSnapshot,
      modelKey: parsed.modelKey === undefined ? undefined : parsed.modelKey,
      settingsJson: normalizedSettingsJson,
      resourceRefs: parsed.resourceRefs,
      positionX: parsed.positionX === undefined ? undefined : String(parsed.positionX),
      positionY: parsed.positionY === undefined ? undefined : String(parsed.positionY),
      status: parsed.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(canvasNodes.id, parsed.nodeId),
        eq(canvasNodes.canvasId, parsed.canvasId),
        eq(canvasNodes.workspaceId, parsed.workspaceId),
      ),
    )
    .returning();

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "update_node",
  });

  return node;
}

export async function deleteNode(input: z.infer<typeof deleteNodeInputSchema>) {
  const parsed = deleteNodeInputSchema.parse(input);
  await assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.nodeId);

  const deletedNode = await db.transaction(async (tx) => {
    await deleteNodeRuntimeRecords(tx, {
      workspaceId: parsed.workspaceId,
      canvasId: parsed.canvasId,
      nodeId: parsed.nodeId,
    });

    await tx
      .delete(canvasEdges)
      .where(
        and(
          eq(canvasEdges.canvasId, parsed.canvasId),
          eq(canvasEdges.workspaceId, parsed.workspaceId),
          or(
            eq(canvasEdges.sourceNodeId, parsed.nodeId),
            eq(canvasEdges.targetNodeId, parsed.nodeId),
          ),
        ),
      );

    const [deletedNode] = await tx
      .delete(canvasNodes)
      .where(
        and(
          eq(canvasNodes.id, parsed.nodeId),
          eq(canvasNodes.canvasId, parsed.canvasId),
          eq(canvasNodes.workspaceId, parsed.workspaceId),
        ),
      )
      .returning();

    return deletedNode;
  });

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "delete_node",
  });

  return deletedNode;
}

export async function createEdge(input: z.infer<typeof createEdgeInputSchema>) {
  const parsed = createEdgeInputSchema.parse(input);
  await assertCanvasExists(parsed.workspaceId, parsed.canvasId);
  await Promise.all([
    assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.sourceNodeId),
    assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.targetNodeId),
  ]);

  const existingEdge = await db
    .select()
    .from(canvasEdges)
    .where(
      and(
        eq(canvasEdges.canvasId, parsed.canvasId),
        eq(canvasEdges.workspaceId, parsed.workspaceId),
        eq(canvasEdges.sourceNodeId, parsed.sourceNodeId),
        eq(canvasEdges.targetNodeId, parsed.targetNodeId),
      ),
    )
    .limit(1);

  if (existingEdge.length > 0) {
    throw new ApiError(409, "CONFLICT", "A canvas edge for this node pair already exists.");
  }

  const currentEdges = await db
    .select({
      sourceNodeId: canvasEdges.sourceNodeId,
      targetNodeId: canvasEdges.targetNodeId,
    })
    .from(canvasEdges)
    .where(
      and(
        eq(canvasEdges.canvasId, parsed.canvasId),
        eq(canvasEdges.workspaceId, parsed.workspaceId),
      ),
    );

  assertNoCycle(currentEdges, parsed.sourceNodeId, parsed.targetNodeId);

  const [edge] = await db
    .insert(canvasEdges)
    .values({
      canvasId: parsed.canvasId,
      workspaceId: parsed.workspaceId,
      sourceNodeId: parsed.sourceNodeId,
      targetNodeId: parsed.targetNodeId,
      mergeMode: parsed.mergeMode,
      priority: parsed.priority,
    })
    .returning();

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "create_edge",
  });

  return edge;
}

export async function deleteEdge(input: z.infer<typeof deleteEdgeInputSchema>) {
  const parsed = deleteEdgeInputSchema.parse(input);
  await assertEdgeExists(parsed.workspaceId, parsed.canvasId, parsed.edgeId);

  const [edge] = await db
    .delete(canvasEdges)
    .where(
      and(
        eq(canvasEdges.id, parsed.edgeId),
        eq(canvasEdges.canvasId, parsed.canvasId),
        eq(canvasEdges.workspaceId, parsed.workspaceId),
      ),
    )
    .returning();

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "delete_edge",
  });

  return edge;
}

export async function patchCanvasGraph(input: z.infer<typeof patchCanvasGraphInputSchema>) {
  const parsed = patchCanvasGraphInputSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const canvas = await assertCanvasExistsWithExecutor(tx, parsed.workspaceId, parsed.canvasId);

    if (canvas.version !== parsed.baseVersion) {
      throw new ApiError(409, "CANVAS_VERSION_CONFLICT", "Canvas has been updated by another request.");
    }

    const [existingNodes, existingEdges] = await Promise.all([
      tx
        .select()
        .from(canvasNodes)
        .where(and(eq(canvasNodes.workspaceId, parsed.workspaceId), eq(canvasNodes.canvasId, parsed.canvasId))),
      tx
        .select()
        .from(canvasEdges)
        .where(and(eq(canvasEdges.workspaceId, parsed.workspaceId), eq(canvasEdges.canvasId, parsed.canvasId))),
    ]);
    const nodeById = new Map(existingNodes.map((node) => [node.id, node]));
    const edgeById = new Map(existingEdges.map((edge) => [edge.id, edge]));
    const touchedNodes = new Map<string, CanvasNodeRecord>();
    const touchedEdges = new Map<string, CanvasEdgeRecord>();
    const createdNodeByClientId = new Map<string, CanvasNodeRecord>();
    const deletedNodeIds: string[] = [];
    const deletedEdgeIds: string[] = [];
    const operationResults: Array<{
      type: string;
      clientId: string | null;
      nodeId: string | null;
      edgeId: string | null;
    }> = [];

    for (const operation of parsed.operations) {
      if (operation.type === "move_nodes") {
        const dedupedUpdates = Array.from(new Map(operation.updates.map((update) => [update.nodeId, update])).values());

        for (const update of dedupedUpdates) {
          if (!nodeById.has(update.nodeId)) {
            throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
          }

          const [updatedNode] = await tx
            .update(canvasNodes)
            .set({
              positionX: String(update.positionX),
              positionY: String(update.positionY),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(canvasNodes.id, update.nodeId),
                eq(canvasNodes.canvasId, parsed.canvasId),
                eq(canvasNodes.workspaceId, parsed.workspaceId),
              ),
            )
            .returning();

          nodeById.set(updatedNode.id, updatedNode);
          touchedNodes.set(updatedNode.id, updatedNode);
        }

        operationResults.push({
          type: operation.type,
          clientId: null,
          nodeId: null,
          edgeId: null,
        });

        continue;
      }

      if (operation.type === "update_node") {
        if (!nodeById.has(operation.nodeId)) {
          throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
        }

        const [updatedNode] = await tx
          .update(canvasNodes)
          .set(buildNodeUpdateValues(operation.patch))
          .where(
            and(
              eq(canvasNodes.id, operation.nodeId),
              eq(canvasNodes.canvasId, parsed.canvasId),
              eq(canvasNodes.workspaceId, parsed.workspaceId),
            ),
          )
          .returning();

        nodeById.set(updatedNode.id, updatedNode);
        touchedNodes.set(updatedNode.id, updatedNode);
        operationResults.push({
          type: operation.type,
          clientId: null,
          nodeId: updatedNode.id,
          edgeId: null,
        });

        continue;
      }

      if (operation.type === "create_node") {
        const [createdNode] = await tx
          .insert(canvasNodes)
          .values({
            canvasId: parsed.canvasId,
            workspaceId: parsed.workspaceId,
            type: operation.node.type,
            title: operation.node.title,
            createdBy: parsed.actorId,
            promptInput: operation.node.promptInput,
            outputSnapshot: operation.node.outputSnapshot,
            modelKey: operation.node.modelKey,
            settingsJson: operation.node.settingsJson ?? {},
            resourceRefs: operation.node.resourceRefs ?? {
              subjectIds: [],
              sceneIds: [],
              instructionPresetIds: [],
              assetIds: [],
            },
            status: "idle",
            positionX: String(operation.node.positionX ?? 0),
            positionY: String(operation.node.positionY ?? 0),
          })
          .returning();

        nodeById.set(createdNode.id, createdNode);
        touchedNodes.set(createdNode.id, createdNode);

        if (operation.clientId) {
          createdNodeByClientId.set(operation.clientId, createdNode);
        }

        operationResults.push({
          type: operation.type,
          clientId: operation.clientId ?? null,
          nodeId: createdNode.id,
          edgeId: null,
        });

        continue;
      }

      if (operation.type === "delete_node") {
        const deletedNode = nodeById.get(operation.nodeId);

        if (!deletedNode) {
          throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
        }

        const relatedEdges = Array.from(edgeById.values()).filter(
          (edge) => edge.sourceNodeId === deletedNode.id || edge.targetNodeId === deletedNode.id,
        );

        if (relatedEdges.length > 0) {
          await tx
            .delete(canvasEdges)
            .where(
              and(
                eq(canvasEdges.canvasId, parsed.canvasId),
                eq(canvasEdges.workspaceId, parsed.workspaceId),
                inArray(
                  canvasEdges.id,
                  relatedEdges.map((edge) => edge.id),
                ),
              ),
            );

          for (const relatedEdge of relatedEdges) {
            edgeById.delete(relatedEdge.id);
            touchedEdges.delete(relatedEdge.id);
            deletedEdgeIds.push(relatedEdge.id);
          }
        }

        await deleteNodeRuntimeRecords(tx, {
          workspaceId: parsed.workspaceId,
          canvasId: parsed.canvasId,
          nodeId: deletedNode.id,
        });

        await tx
          .delete(canvasNodes)
          .where(
            and(
              eq(canvasNodes.id, deletedNode.id),
              eq(canvasNodes.canvasId, parsed.canvasId),
              eq(canvasNodes.workspaceId, parsed.workspaceId),
            ),
          );

        nodeById.delete(deletedNode.id);
        touchedNodes.delete(deletedNode.id);
        deletedNodeIds.push(deletedNode.id);
        operationResults.push({
          type: operation.type,
          clientId: null,
          nodeId: deletedNode.id,
          edgeId: null,
        });

        continue;
      }

      if (operation.type === "create_edge") {
        const sourceNodeId = resolveNodeReference(operation.edge.sourceNodeId, nodeById, createdNodeByClientId);
        const targetNodeId = resolveNodeReference(operation.edge.targetNodeId, nodeById, createdNodeByClientId);

        if (
          Array.from(edgeById.values()).some(
            (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId,
          )
        ) {
          throw new ApiError(409, "CONFLICT", "A canvas edge for this node pair already exists.");
        }

        assertNoCycle(
          Array.from(edgeById.values()).map((edge) => ({
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
          })),
          sourceNodeId,
          targetNodeId,
        );

        const [createdEdge] = await tx
          .insert(canvasEdges)
          .values({
            canvasId: parsed.canvasId,
            workspaceId: parsed.workspaceId,
            sourceNodeId,
            targetNodeId,
            mergeMode: operation.edge.mergeMode,
            priority: operation.edge.priority ?? 0,
          })
          .returning();

        edgeById.set(createdEdge.id, createdEdge);
        touchedEdges.set(createdEdge.id, createdEdge);
        operationResults.push({
          type: operation.type,
          clientId: null,
          nodeId: null,
          edgeId: createdEdge.id,
        });

        continue;
      }

      const deletedEdge = edgeById.get(operation.edgeId);

      if (!deletedEdge) {
        throw new ApiError(404, "EDGE_NOT_FOUND", "Canvas edge not found.");
      }

      await tx
        .delete(canvasEdges)
        .where(
          and(
            eq(canvasEdges.id, deletedEdge.id),
            eq(canvasEdges.canvasId, parsed.canvasId),
            eq(canvasEdges.workspaceId, parsed.workspaceId),
          ),
        );

      edgeById.delete(deletedEdge.id);
      touchedEdges.delete(deletedEdge.id);
      deletedEdgeIds.push(deletedEdge.id);
      operationResults.push({
        type: operation.type,
        clientId: null,
        nodeId: null,
        edgeId: deletedEdge.id,
      });
    }

    const [updatedCanvas] = await tx
      .update(canvases)
      .set({
        version: canvas.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canvases.id, parsed.canvasId),
          eq(canvases.workspaceId, parsed.workspaceId),
          eq(canvases.version, parsed.baseVersion),
        ),
      )
      .returning();

    if (!updatedCanvas) {
      throw new ApiError(409, "CANVAS_VERSION_CONFLICT", "Canvas has been updated by another request.");
    }

    return {
      canvasVersion: updatedCanvas.version,
      nodes: await hydrateCanvasNodes(parsed.workspaceId, Array.from(touchedNodes.values())),
      edges: Array.from(touchedEdges.values()),
      deletedNodeIds,
      deletedEdgeIds,
      operationResults,
    };
  });

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "patch_graph",
  });

  return result;
}
