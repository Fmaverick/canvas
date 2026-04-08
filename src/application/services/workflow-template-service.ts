import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { canvasEdges, canvasNodes, canvases, workflowTemplates } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";
import { notifyCanvasRuntimeChanged } from "@/lib/canvas-runtime-events";

const workflowTemplateScopeSchema = z.enum(["personal", "workspace"]);
const workflowTemplateStatusSchema = z.enum(["active", "archived"]);
const templateResourceRefsSchema = z.object({
  subjectIds: z.array(z.string().uuid()).optional(),
  sceneIds: z.array(z.string().uuid()).optional(),
  instructionPresetIds: z.array(z.string().uuid()).optional(),
  assetIds: z.array(z.string().uuid()).optional(),
});

export const listWorkflowTemplatesInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
});

export const createWorkflowTemplateInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  scope: workflowTemplateScopeSchema,
  name: z.string().trim().min(1, "模板名称不能为空。"),
  description: z.string().trim().optional(),
  effectCategory: z.string().trim().optional(),
  contentCategory: z.string().trim().optional(),
  tags: z.array(z.string().trim()).default([]),
  sourceCanvasId: z.uuid(),
});

export const updateWorkflowTemplateInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  templateId: z.uuid(),
  scope: workflowTemplateScopeSchema.optional(),
  name: z.string().trim().min(1, "模板名称不能为空。").optional(),
  description: z.string().trim().nullable().optional(),
  effectCategory: z.string().trim().nullable().optional(),
  contentCategory: z.string().trim().nullable().optional(),
  tags: z.array(z.string().trim()).optional(),
  status: workflowTemplateStatusSchema.optional(),
});

export const deleteWorkflowTemplateInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  templateId: z.uuid(),
});

export const applyWorkflowTemplateInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  templateId: z.uuid(),
  canvasId: z.uuid(),
});

type WorkflowTemplateRecord = typeof workflowTemplates.$inferSelect;

function selectShape() {
  return {
    id: workflowTemplates.id,
    workspaceId: workflowTemplates.workspaceId,
    createdBy: workflowTemplates.createdBy,
    scope: workflowTemplates.scope,
    name: workflowTemplates.name,
    description: workflowTemplates.description,
    coverAssetId: workflowTemplates.coverAssetId,
    effectCategory: workflowTemplates.effectCategory,
    contentCategory: workflowTemplates.contentCategory,
    snapshotJson: workflowTemplates.snapshotJson,
    tags: workflowTemplates.tags,
    usageCount: workflowTemplates.usageCount,
    status: workflowTemplates.status,
    createdAt: workflowTemplates.createdAt,
    updatedAt: workflowTemplates.updatedAt,
  };
}

function summarizeTemplate(template: Awaited<ReturnType<typeof getWorkflowTemplateById>>) {
  return {
    ...template,
    nodeCount: template.snapshotJson.nodes.length,
    edgeCount: template.snapshotJson.edges.length,
  };
}

async function assertCanvasExists(workspaceId: string, canvasId: string) {
  const [canvas] = await db
    .select({
      id: canvases.id,
      workspaceId: canvases.workspaceId,
      name: canvases.name,
    })
    .from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.workspaceId, workspaceId)))
    .limit(1);

  if (!canvas) {
    throw new ApiError(404, "CANVAS_NOT_FOUND", "画布不存在。");
  }

  return canvas;
}

async function getWorkflowTemplateById(workspaceId: string, templateId: string, userId?: string) {
  const [template] = await db
    .select(selectShape())
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, templateId),
        eq(workflowTemplates.workspaceId, workspaceId),
        userId
          ? or(
              eq(workflowTemplates.scope, "workspace"),
              and(eq(workflowTemplates.scope, "personal"), eq(workflowTemplates.createdBy, userId)),
            )
          : undefined,
      ),
    )
    .limit(1);

  if (!template) {
    throw new ApiError(404, "WORKFLOW_TEMPLATE_NOT_FOUND", "工作流模板不存在。");
  }

  return template;
}

async function assertTemplateEditable(workspaceId: string, templateId: string, userId: string) {
  const template = await getWorkflowTemplateById(workspaceId, templateId);

  if (template.scope === "personal" && template.createdBy !== userId) {
    throw new ApiError(403, "WORKFLOW_TEMPLATE_FORBIDDEN", "无权编辑该个人模板。");
  }

  return template;
}

async function buildCanvasSnapshot(workspaceId: string, canvasId: string) {
  await assertCanvasExists(workspaceId, canvasId);

  const [nodes, edges] = await Promise.all([
    db
      .select()
      .from(canvasNodes)
      .where(and(eq(canvasNodes.workspaceId, workspaceId), eq(canvasNodes.canvasId, canvasId)))
      .orderBy(canvasNodes.createdAt),
    db
      .select()
      .from(canvasEdges)
      .where(and(eq(canvasEdges.workspaceId, workspaceId), eq(canvasEdges.canvasId, canvasId)))
      .orderBy(canvasEdges.createdAt),
  ]);

  const nodeIndexMap = new Map(nodes.map((node, index) => [node.id, `template-node-${index + 1}`]));

  return {
    nodes: nodes.map((node) => ({
      templateNodeId: nodeIndexMap.get(node.id) ?? node.id,
      type: node.type,
      title: node.title,
      promptInput: node.promptInput ?? "",
      modelKey: node.modelKey ?? null,
      settingsJson: (node.settingsJson as Record<string, unknown> | null | undefined) ?? {},
      resourceRefs:
        (node.resourceRefs as z.infer<typeof templateResourceRefsSchema> | null | undefined) ?? {
          subjectIds: [],
          sceneIds: [],
          instructionPresetIds: [],
          assetIds: [],
        },
      status: "idle",
      positionX: Number.parseFloat(node.positionX || "0"),
      positionY: Number.parseFloat(node.positionY || "0"),
    })),
    edges: edges
      .map((edge) => {
        const sourceTemplateNodeId = nodeIndexMap.get(edge.sourceNodeId);
        const targetTemplateNodeId = nodeIndexMap.get(edge.targetNodeId);

        if (!sourceTemplateNodeId || !targetTemplateNodeId) {
          return null;
        }

        return {
          sourceTemplateNodeId,
          targetTemplateNodeId,
          mergeMode: edge.mergeMode,
          priority: edge.priority,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)),
  };
}

export async function listWorkflowTemplates(input: z.infer<typeof listWorkflowTemplatesInputSchema>) {
  const parsed = listWorkflowTemplatesInputSchema.parse(input);
  const templates = await db
    .select(selectShape())
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.workspaceId, parsed.workspaceId),
        eq(workflowTemplates.status, "active"),
        or(
          eq(workflowTemplates.scope, "workspace"),
          and(eq(workflowTemplates.scope, "personal"), eq(workflowTemplates.createdBy, parsed.userId)),
        ),
      ),
    )
    .orderBy(desc(workflowTemplates.updatedAt));

  return templates.map((template) =>
    summarizeTemplate({
      ...template,
      snapshotJson: template.snapshotJson ?? { nodes: [], edges: [] },
    }),
  );
}

export async function createWorkflowTemplate(input: z.infer<typeof createWorkflowTemplateInputSchema>) {
  const parsed = createWorkflowTemplateInputSchema.parse(input);
  const snapshotJson = await buildCanvasSnapshot(parsed.workspaceId, parsed.sourceCanvasId);

  if (snapshotJson.nodes.length === 0) {
    throw new ApiError(409, "WORKFLOW_TEMPLATE_EMPTY", "当前画布没有可保存的节点。");
  }

  const [createdTemplate] = await db
    .insert(workflowTemplates)
    .values({
      workspaceId: parsed.workspaceId,
      createdBy: parsed.userId,
      scope: parsed.scope,
      name: parsed.name,
      description: parsed.description,
      effectCategory: parsed.effectCategory,
      contentCategory: parsed.contentCategory,
      tags: parsed.tags,
      snapshotJson,
      status: "active",
    })
    .returning();

  return summarizeTemplate({
    ...createdTemplate,
    snapshotJson: createdTemplate.snapshotJson ?? { nodes: [], edges: [] },
  });
}

export async function updateWorkflowTemplate(input: z.infer<typeof updateWorkflowTemplateInputSchema>) {
  const parsed = updateWorkflowTemplateInputSchema.parse(input);
  await assertTemplateEditable(parsed.workspaceId, parsed.templateId, parsed.userId);

  await db
    .update(workflowTemplates)
    .set({
      scope: parsed.scope,
      name: parsed.name,
      description: parsed.description === undefined ? undefined : parsed.description,
      effectCategory: parsed.effectCategory === undefined ? undefined : parsed.effectCategory,
      contentCategory: parsed.contentCategory === undefined ? undefined : parsed.contentCategory,
      tags: parsed.tags,
      status: parsed.status,
      updatedAt: new Date(),
    })
    .where(and(eq(workflowTemplates.id, parsed.templateId), eq(workflowTemplates.workspaceId, parsed.workspaceId)));

  return summarizeTemplate(await getWorkflowTemplateById(parsed.workspaceId, parsed.templateId));
}

export async function deleteWorkflowTemplate(input: z.infer<typeof deleteWorkflowTemplateInputSchema>) {
  const parsed = deleteWorkflowTemplateInputSchema.parse(input);
  await assertTemplateEditable(parsed.workspaceId, parsed.templateId, parsed.userId);

  const [deletedTemplate] = await db
    .delete(workflowTemplates)
    .where(and(eq(workflowTemplates.id, parsed.templateId), eq(workflowTemplates.workspaceId, parsed.workspaceId)))
    .returning();

  return deletedTemplate;
}

export async function applyWorkflowTemplate(input: z.infer<typeof applyWorkflowTemplateInputSchema>) {
  const parsed = applyWorkflowTemplateInputSchema.parse(input);
  const template = await getWorkflowTemplateById(parsed.workspaceId, parsed.templateId, parsed.userId);
  await assertCanvasExists(parsed.workspaceId, parsed.canvasId);

  const snapshot = template.snapshotJson ?? { nodes: [], edges: [] };

  if (snapshot.nodes.length === 0) {
    throw new ApiError(409, "WORKFLOW_TEMPLATE_EMPTY", "模板中没有可插入的节点。");
  }

  const [existingNodes] = await Promise.all([
    db
      .select({
        positionX: canvasNodes.positionX,
        positionY: canvasNodes.positionY,
      })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.workspaceId, parsed.workspaceId), eq(canvasNodes.canvasId, parsed.canvasId))),
  ]);
  const maxX = existingNodes.length > 0 ? Math.max(...existingNodes.map((node) => Number.parseFloat(node.positionX || "0"))) : 0;
  const minY = existingNodes.length > 0 ? Math.min(...existingNodes.map((node) => Number.parseFloat(node.positionY || "0"))) : 0;
  const templateMinX = Math.min(...snapshot.nodes.map((node) => node.positionX));
  const templateMinY = Math.min(...snapshot.nodes.map((node) => node.positionY));
  const offsetX = maxX + 220 - templateMinX;
  const offsetY = minY + 40 - templateMinY;

  const result = await db.transaction(async (tx) => {
    const templateNodeIdMap = new Map<string, string>();
    const createdNodes: Array<{ id: string; type: string; title: string }> = [];

    for (const snapshotNode of snapshot.nodes) {
      const [createdNode] = await tx
        .insert(canvasNodes)
        .values({
          canvasId: parsed.canvasId,
          workspaceId: parsed.workspaceId,
          createdBy: parsed.userId,
          type: snapshotNode.type,
          title: snapshotNode.title,
          promptInput: snapshotNode.promptInput,
          outputSnapshot: null,
          modelKey: snapshotNode.modelKey ?? null,
          settingsJson: snapshotNode.settingsJson ?? {},
          resourceRefs: snapshotNode.resourceRefs ?? {},
          status: "idle",
          appliedTemplateId: parsed.templateId,
          positionX: String(Math.round(snapshotNode.positionX + offsetX)),
          positionY: String(Math.round(snapshotNode.positionY + offsetY)),
        })
        .returning({
          id: canvasNodes.id,
          type: canvasNodes.type,
          title: canvasNodes.title,
        });

      templateNodeIdMap.set(snapshotNode.templateNodeId, createdNode.id);
      createdNodes.push(createdNode);
    }

    const createdEdges: Array<{ id: string }> = [];

    for (const snapshotEdge of snapshot.edges) {
      const sourceNodeId = templateNodeIdMap.get(snapshotEdge.sourceTemplateNodeId);
      const targetNodeId = templateNodeIdMap.get(snapshotEdge.targetTemplateNodeId);

      if (!sourceNodeId || !targetNodeId) {
        continue;
      }

      const [createdEdge] = await tx
        .insert(canvasEdges)
        .values({
          canvasId: parsed.canvasId,
          workspaceId: parsed.workspaceId,
          sourceNodeId,
          targetNodeId,
          mergeMode: snapshotEdge.mergeMode,
          priority: snapshotEdge.priority,
        })
        .returning({ id: canvasEdges.id });

      createdEdges.push(createdEdge);
    }

    await tx
      .update(workflowTemplates)
      .set({
        usageCount: template.usageCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(workflowTemplates.id, parsed.templateId));

    return {
      nodes: createdNodes,
      edges: createdEdges,
    };
  });

  notifyCanvasRuntimeChanged({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    reason: "apply_workflow_template",
  });

  return result;
}
