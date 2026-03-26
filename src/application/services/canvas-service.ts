import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { assets, canvasEdges, canvasNodes, canvases } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";

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
  settingsJson: z.record(z.string(), z.unknown()).optional(),
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

async function assertCanvasExists(workspaceId: string, canvasId: string) {
  const [canvas] = await db
    .select()
    .from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.workspaceId, workspaceId)))
    .limit(1);

  if (!canvas) {
    throw new ApiError(404, "CANVAS_NOT_FOUND", "Canvas not found.");
  }

  return canvas;
}

async function assertNodeExists(workspaceId: string, canvasId: string, nodeId: string) {
  const [node] = await db
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

async function assertEdgeExists(workspaceId: string, canvasId: string, edgeId: string) {
  const [edge] = await db
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
          .where(and(eq(assets.workspaceId, parsed.workspaceId), inArray(assets.id, referencedAssetIds)))
      : [];
  const referenceAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset]));

  return {
    ...canvas,
    nodes: nodes.map((node) => {
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
    }),
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

  return node;
}

export async function updateNode(input: z.infer<typeof updateNodeInputSchema>) {
  const parsed = updateNodeInputSchema.parse(input);
  await assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.nodeId);

  const [node] = await db
    .update(canvasNodes)
    .set({
      title: parsed.title,
      promptInput: parsed.promptInput === undefined ? undefined : parsed.promptInput,
      outputSnapshot: parsed.outputSnapshot === undefined ? undefined : parsed.outputSnapshot,
      modelKey: parsed.modelKey === undefined ? undefined : parsed.modelKey,
      settingsJson: parsed.settingsJson,
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

  return node;
}

export async function deleteNode(input: z.infer<typeof deleteNodeInputSchema>) {
  const parsed = deleteNodeInputSchema.parse(input);
  await assertNodeExists(parsed.workspaceId, parsed.canvasId, parsed.nodeId);

  return db.transaction(async (tx) => {
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

  return edge;
}
