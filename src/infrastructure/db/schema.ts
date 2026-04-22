import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    name: varchar("name", { length: 100 }).notNull(),
    avatarUrl: text("avatar_url"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_status_idx").on(table.status)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [index("workspaces_owner_id_idx").on(table.ownerId), index("workspaces_type_status_idx").on(table.type, table.status)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: varchar("role", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    invitedBy: uuid("invited_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
    index("user_sessions_user_id_expires_at_idx").on(table.userId, table.expiresAt),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    styleMeta: jsonb("style_meta").$type<Record<string, unknown>>().notNull().default({}),
    brandTone: text("brand_tone"),
    channelMeta: jsonb("channel_meta").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [index("products_workspace_status_idx").on(table.workspaceId, table.status), index("products_workspace_name_idx").on(table.workspaceId, table.name)],
);

export const modelProfiles = pgTable(
  "model_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: varchar("name", { length: 100 }).notNull(),
    gender: varchar("gender", { length: 20 }),
    ageRange: varchar("age_range", { length: 50 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    appearanceMeta: jsonb("appearance_meta").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [index("model_profiles_workspace_status_idx").on(table.workspaceId, table.status)],
);

export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: varchar("kind", { length: 20 }).notNull(),
    entityType: varchar("entity_type", { length: 30 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    coverAssetId: uuid("cover_asset_id"),
    promptHints: text("prompt_hints"),
    profileMeta: jsonb("profile_meta").$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    volcengineAssetGroupId: varchar("volcengine_asset_group_id", { length: 255 }),
    volcengineProjectName: varchar("volcengine_project_name", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("library_items_workspace_kind_status_idx").on(table.workspaceId, table.kind, table.status),
    index("library_items_workspace_name_idx").on(table.workspaceId, table.name),
  ],
);

export const instructionPresets = pgTable(
  "instruction_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    scope: varchar("scope", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    promptTemplate: text("prompt_template").notNull(),
    negativePrompt: text("negative_prompt"),
    variableSchema: jsonb("variable_schema").$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    isPublic: boolean("is_public").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("instruction_presets_created_scope_idx").on(table.createdBy, table.scope),
    index("instruction_presets_workspace_scope_status_idx").on(table.workspaceId, table.scope, table.status),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    ownerType: varchar("owner_type", { length: 50 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    assetType: varchar("asset_type", { length: 20 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    storageKey: text("storage_key").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    checksum: varchar("checksum", { length: 128 }),
    volcengineAssetId: varchar("volcengine_asset_id", { length: 255 }),
    volcengineAssetGroupId: varchar("volcengine_asset_group_id", { length: 255 }),
    volcengineProjectName: varchar("volcengine_project_name", { length: 100 }),
    volcengineSyncStatus: varchar("volcengine_sync_status", { length: 30 }).notNull().default("not_synced"),
    volcengineLastSyncedAt: timestamp("volcengine_last_synced_at", { withTimezone: true }),
    volcengineLastSyncErrorCode: varchar("volcengine_last_sync_error_code", { length: 100 }),
    volcengineLastSyncError: text("volcengine_last_sync_error"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assets_workspace_owner_idx").on(table.workspaceId, table.ownerType, table.ownerId), index("assets_asset_type_idx").on(table.assetType)],
);

export const canvases = pgTable(
  "canvases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [index("canvases_workspace_status_idx").on(table.workspaceId, table.status), index("canvases_workspace_updated_at_idx").on(table.workspaceId, table.updatedAt)],
);

export const canvasNodes = pgTable(
  "canvas_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    type: varchar("type", { length: 20 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    copiedFromNodeId: uuid("copied_from_node_id"),
    appliedTemplateId: uuid("applied_template_id"),
    promptInput: text("prompt_input"),
    modelKey: varchar("model_key", { length: 100 }),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
    resourceRefs: jsonb("resource_refs")
      .$type<{ subjectIds?: string[]; sceneIds?: string[]; instructionPresetIds?: string[]; assetIds?: string[] }>()
      .notNull()
      .default({}),
    outputSnapshot: jsonb("output_snapshot").$type<Record<string, unknown> | null>().default(null),
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    positionX: numeric("position_x", { precision: 10, scale: 2 }).notNull().default("0"),
    positionY: numeric("position_y", { precision: 10, scale: 2 }).notNull().default("0"),
    ...timestamps,
  },
  (table) => [
    index("canvas_nodes_canvas_id_idx").on(table.canvasId),
    index("canvas_nodes_workspace_type_idx").on(table.workspaceId, table.type),
    index("canvas_nodes_copied_from_idx").on(table.copiedFromNodeId),
    index("canvas_nodes_applied_template_idx").on(table.appliedTemplateId),
  ],
);

export const canvasEdges = pgTable(
  "canvas_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => canvasNodes.id),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => canvasNodes.id),
    mergeMode: varchar("merge_mode", { length: 30 }).notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("canvas_edges_unique").on(table.canvasId, table.sourceNodeId, table.targetNodeId)],
);

export const nodeTemplates = pgTable(
  "node_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    scope: varchar("scope", { length: 20 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    coverAssetId: uuid("cover_asset_id"),
    promptInput: text("prompt_input"),
    modelKey: varchar("model_key", { length: 100 }),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
    resourceRefs: jsonb("resource_refs")
      .$type<{ subjectIds?: string[]; sceneIds?: string[]; instructionPresetIds?: string[]; assetIds?: string[] }>()
      .notNull()
      .default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    isPublic: boolean("is_public").notNull().default(false),
    usageCount: integer("usage_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("node_templates_created_scope_idx").on(table.createdBy, table.scope),
    index("node_templates_workspace_scope_status_idx").on(table.workspaceId, table.scope, table.status),
    index("node_templates_type_status_idx").on(table.type, table.status),
  ],
);

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    scope: varchar("scope", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    coverAssetId: uuid("cover_asset_id"),
    effectCategory: varchar("effect_category", { length: 80 }),
    contentCategory: varchar("content_category", { length: 80 }),
    snapshotJson: jsonb("snapshot_json")
      .$type<{
        nodes: Array<{
          templateNodeId: string;
          type: string;
          title: string;
          promptInput: string;
          outputSnapshot?: Record<string, unknown> | null;
          modelKey?: string | null;
          settingsJson?: Record<string, unknown>;
          resourceRefs?: {
            subjectIds?: string[];
            sceneIds?: string[];
            instructionPresetIds?: string[];
            assetIds?: string[];
          };
          status?: string | null;
          positionX: number;
          positionY: number;
        }>;
        edges: Array<{
          sourceTemplateNodeId: string;
          targetTemplateNodeId: string;
          mergeMode: string;
          priority: number;
        }>;
      }>()
      .notNull()
      .default({ nodes: [], edges: [] }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    usageCount: integer("usage_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("workflow_templates_workspace_scope_status_idx").on(table.workspaceId, table.scope, table.status),
    index("workflow_templates_created_by_idx").on(table.createdBy),
    index("workflow_templates_effect_category_idx").on(table.effectCategory),
    index("workflow_templates_content_category_idx").on(table.contentCategory),
  ],
);

export const tableNodeRows = pgTable(
  "table_node_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => canvasNodes.id),
    rowOrder: integer("row_order").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("idle"),
    sourceType: varchar("source_type", { length: 20 }).notNull().default("manual"),
    metaJson: jsonb("meta_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("table_node_rows_node_order_unique").on(table.nodeId, table.rowOrder),
    uniqueIndex("table_node_rows_workspace_canvas_node_id_unique").on(table.workspaceId, table.canvasId, table.nodeId, table.id),
    index("table_node_rows_node_order_idx").on(table.nodeId, table.rowOrder),
    index("table_node_rows_workspace_node_status_idx").on(table.workspaceId, table.nodeId, table.status),
    check("table_node_rows_order_non_negative", sql`${table.rowOrder} >= 0`),
  ],
);

export const tableNodeColumns = pgTable(
  "table_node_columns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => canvasNodes.id),
    key: varchar("key", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 30 }).notNull(),
    columnOrder: integer("column_order").notNull(),
    required: boolean("required").notNull().default(false),
    dependencyColumnIds: jsonb("dependency_column_ids").$type<string[]>().notNull().default([]),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("table_node_columns_node_key_unique").on(table.nodeId, table.key),
    uniqueIndex("table_node_columns_node_order_unique").on(table.nodeId, table.columnOrder),
    uniqueIndex("table_node_columns_workspace_canvas_node_id_unique").on(table.workspaceId, table.canvasId, table.nodeId, table.id),
    index("table_node_columns_node_order_idx").on(table.nodeId, table.columnOrder),
    index("table_node_columns_workspace_node_kind_idx").on(table.workspaceId, table.nodeId, table.kind),
    check("table_node_columns_order_non_negative", sql`${table.columnOrder} >= 0`),
    check("table_node_columns_dependency_ids_array", sql`jsonb_typeof(${table.dependencyColumnIds}) = 'array'`),
  ],
);

export const tableNodeCells = pgTable(
  "table_node_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => canvasNodes.id),
    rowId: uuid("row_id").notNull(),
    columnId: uuid("column_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    contentText: text("content_text"),
    assetId: uuid("asset_id").references(() => assets.id),
    resultType: varchar("result_type", { length: 20 }),
    resultMeta: jsonb("result_meta").$type<Record<string, unknown>>().notNull().default({}),
    latestTaskId: uuid("latest_task_id"),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("table_node_cells_row_column_unique").on(table.rowId, table.columnId),
    uniqueIndex("table_node_cells_workspace_canvas_node_id_unique").on(table.workspaceId, table.canvasId, table.nodeId, table.id),
    index("table_node_cells_node_row_idx").on(table.nodeId, table.rowId),
    index("table_node_cells_node_column_idx").on(table.nodeId, table.columnId),
    index("table_node_cells_workspace_node_status_idx").on(table.workspaceId, table.nodeId, table.status),
    index("table_node_cells_latest_task_idx").on(table.latestTaskId),
    foreignKey({
      columns: [table.workspaceId, table.canvasId, table.nodeId, table.rowId],
      foreignColumns: [tableNodeRows.workspaceId, tableNodeRows.canvasId, tableNodeRows.nodeId, tableNodeRows.id],
      name: "table_node_cells_row_scope_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.canvasId, table.nodeId, table.columnId],
      foreignColumns: [tableNodeColumns.workspaceId, tableNodeColumns.canvasId, tableNodeColumns.nodeId, tableNodeColumns.id],
      name: "table_node_cells_column_scope_fk",
    }),
  ],
);

export const inputNodeItems = pgTable(
  "input_node_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => canvasNodes.id),
    stableKey: varchar("stable_key", { length: 160 }).notNull(),
    sourceType: varchar("source_type", { length: 20 }).notNull(),
    displayLabel: varchar("display_label", { length: 255 }).notNull(),
    contentText: text("content_text"),
    assetId: uuid("asset_id").references(() => assets.id),
    sourceRefJson: jsonb("source_ref_json").$type<Record<string, unknown>>().notNull().default({}),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("input_node_items_node_stable_key_unique").on(table.nodeId, table.stableKey),
    uniqueIndex("input_node_items_node_sort_order_unique").on(table.nodeId, table.sortOrder),
    index("input_node_items_workspace_node_enabled_idx").on(table.workspaceId, table.nodeId, table.enabled),
    index("input_node_items_node_source_type_idx").on(table.nodeId, table.sourceType),
    index("input_node_items_asset_id_idx").on(table.assetId),
    check("input_node_items_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const nodeRunBatches = pgTable(
  "node_run_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    mode: varchar("mode", { length: 20 }).notNull(),
    batchMode: varchar("batch_mode", { length: 30 }).notNull().default("repeat"),
    status: varchar("status", { length: 30 }).notNull().default("processing"),
    requestedRunCount: integer("requested_run_count").notNull().default(1),
    targetNodeType: varchar("target_node_type", { length: 20 }),
    deriveStrategy: varchar("derive_strategy", { length: 30 }),
    templateSnapshotJson: jsonb("template_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    totalCombinationCount: integer("total_combination_count").notNull().default(0),
    completedCombinationCount: integer("completed_combination_count").notNull().default(0),
    succeededCombinationCount: integer("succeeded_combination_count").notNull().default(0),
    failedCombinationCount: integer("failed_combination_count").notNull().default(0),
    totalShardCount: integer("total_shard_count").notNull().default(0),
    completedShardCount: integer("completed_shard_count").notNull().default(0),
    totalNodeRunCount: integer("total_node_run_count").notNull().default(0),
    completedNodeRunCount: integer("completed_node_run_count").notNull().default(0),
    succeededNodeRunCount: integer("succeeded_node_run_count").notNull().default(0),
    failedNodeRunCount: integer("failed_node_run_count").notNull().default(0),
    resultNodeId: uuid("result_node_id").references(() => canvasNodes.id),
    selectedNodesJson: jsonb("selected_nodes_json")
      .$type<Array<{ id: string; title: string; type: string }>>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (table) => [
    index("node_run_batches_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    index("node_run_batches_canvas_created_at_idx").on(table.canvasId, table.createdAt),
    index("node_run_batches_batch_mode_status_idx").on(table.batchMode, table.status),
    index("node_run_batches_status_idx").on(table.status),
    index("node_run_batches_result_node_idx").on(table.resultNodeId),
  ],
);

export const combinationPlans = pgTable(
  "combination_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    combinationNodeId: uuid("combination_node_id")
      .notNull()
      .references(() => canvasNodes.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    mode: varchar("mode", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    governanceAction: varchar("governance_action", { length: 30 }),
    governanceSignalsJson: jsonb("governance_signals_json").$type<string[]>().notNull().default([]),
    inputNodeIdsJson: jsonb("input_node_ids_json").$type<string[]>().notNull().default([]),
    inputSnapshotJson: jsonb("input_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    samplePreviewJson: jsonb("sample_preview_json").$type<Record<string, unknown>[]>().notNull().default([]),
    estimatedCombinationCount: integer("estimated_combination_count").notNull().default(0),
    totalItemCount: integer("total_item_count").notNull().default(0),
    completedItemCount: integer("completed_item_count").notNull().default(0),
    succeededItemCount: integer("succeeded_item_count").notNull().default(0),
    failedItemCount: integer("failed_item_count").notNull().default(0),
    totalShardCount: integer("total_shard_count").notNull().default(0),
    completedShardCount: integer("completed_shard_count").notNull().default(0),
    succeededShardCount: integer("succeeded_shard_count").notNull().default(0),
    failedShardCount: integer("failed_shard_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    index("combination_plans_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    index("combination_plans_batch_run_idx").on(table.batchRunId),
    index("combination_plans_node_status_idx").on(table.combinationNodeId, table.status),
    index("combination_plans_status_idx").on(table.status),
  ],
);

export const combinationShards = pgTable(
  "combination_shards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => combinationPlans.id),
    shardIndex: integer("shard_index").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    itemStartIndex: integer("item_start_index").notNull().default(0),
    itemEndIndex: integer("item_end_index").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    completedItemCount: integer("completed_item_count").notNull().default(0),
    succeededItemCount: integer("succeeded_item_count").notNull().default(0),
    failedItemCount: integer("failed_item_count").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("combination_shards_plan_shard_index_unique").on(table.planId, table.shardIndex),
    index("combination_shards_batch_status_idx").on(table.batchRunId, table.status),
    index("combination_shards_plan_status_idx").on(table.planId, table.status),
    check("combination_shards_shard_index_non_negative", sql`${table.shardIndex} >= 0`),
    check("combination_shards_item_start_index_non_negative", sql`${table.itemStartIndex} >= 0`),
    check("combination_shards_item_end_index_non_negative", sql`${table.itemEndIndex} >= 0`),
    check("combination_shards_item_count_non_negative", sql`${table.itemCount} >= 0`),
  ],
);

export const combinationItems = pgTable(
  "combination_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => combinationPlans.id),
    shardId: uuid("shard_id").references(() => combinationShards.id),
    itemIndex: integer("item_index").notNull(),
    stableKey: varchar("stable_key", { length: 160 }).notNull(),
    displayLabel: varchar("display_label", { length: 255 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    bindingSummaryJson: jsonb("binding_summary_json").$type<Record<string, unknown>[]>().notNull().default([]),
    inputBindingsJson: jsonb("input_bindings_json").$type<Record<string, unknown>[]>().notNull().default([]),
    sourceBatchItemKey: varchar("source_batch_item_key", { length: 160 }),
    displayOrder: integer("display_order"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorNodeId: uuid("last_error_node_id").references(() => canvasNodes.id),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("combination_items_plan_item_index_unique").on(table.planId, table.itemIndex),
    uniqueIndex("combination_items_plan_stable_key_unique").on(table.planId, table.stableKey),
    index("combination_items_batch_status_idx").on(table.batchRunId, table.status),
    index("combination_items_plan_status_idx").on(table.planId, table.status),
    index("combination_items_shard_display_order_idx").on(table.shardId, table.displayOrder),
    check("combination_items_item_index_non_negative", sql`${table.itemIndex} >= 0`),
  ],
);

export const nodeRuns = pgTable(
  "node_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => canvasNodes.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    combinationPlanId: uuid("combination_plan_id").references(() => combinationPlans.id),
    combinationItemId: uuid("combination_item_id").references(() => combinationItems.id),
    combinationShardId: uuid("combination_shard_id").references(() => combinationShards.id),
    taskId: uuid("task_id"),
    requestId: varchar("request_id", { length: 100 }).notNull(),
    runIndex: integer("run_index"),
    derivedTargetNodeId: uuid("derived_target_node_id").references(() => canvasNodes.id),
    sourceBatchItemKey: varchar("source_batch_item_key", { length: 160 }),
    displayOrder: integer("display_order"),
    nodeType: varchar("node_type", { length: 20 }).notNull(),
    nodeTitle: varchar("node_title", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    resultType: varchar("result_type", { length: 20 }),
    contentText: text("content_text"),
    assetId: uuid("asset_id").references(() => assets.id),
    resultMeta: jsonb("result_meta").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("node_runs_request_id_unique").on(table.requestId),
    index("node_runs_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    index("node_runs_batch_run_idx").on(table.batchRunId, table.runIndex),
    index("node_runs_combination_item_idx").on(table.combinationItemId, table.nodeId, table.createdAt),
    index("node_runs_combination_shard_idx").on(table.combinationShardId, table.displayOrder),
    index("node_runs_node_created_at_idx").on(table.nodeId, table.createdAt),
    index("node_runs_status_idx").on(table.status),
  ],
);

export const generationTasks = pgTable(
  "generation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id").references(() => canvases.id),
    nodeId: uuid("node_id").references(() => canvasNodes.id),
    nodeRunId: uuid("node_run_id").references(() => nodeRuns.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    combinationPlanId: uuid("combination_plan_id").references(() => combinationPlans.id),
    combinationItemId: uuid("combination_item_id").references(() => combinationItems.id),
    combinationShardId: uuid("combination_shard_id").references(() => combinationShards.id),
    batchRunIndex: integer("batch_run_index"),
    sourceBatchItemKey: varchar("source_batch_item_key", { length: 160 }),
    displayOrder: integer("display_order"),
    tableRowId: uuid("table_row_id"),
    tableColumnId: uuid("table_column_id"),
    tableCellId: uuid("table_cell_id"),
    requestId: varchar("request_id", { length: 100 }).notNull(),
    taskType: varchar("task_type", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    providerTaskId: varchar("provider_task_id", { length: 255 }),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull().default({}),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown> | null>().default(null),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    pollCount: integer("poll_count").notNull().default(0),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_tasks_request_id_unique").on(table.requestId),
    index("generation_tasks_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    index("generation_tasks_status_next_poll_idx").on(table.status, table.nextPollAt),
    index("generation_tasks_provider_task_idx").on(table.provider, table.providerTaskId),
    index("generation_tasks_combination_item_created_at_idx").on(table.combinationItemId, table.createdAt),
    index("generation_tasks_combination_shard_created_at_idx").on(table.combinationShardId, table.createdAt),
    index("generation_tasks_node_created_at_idx").on(table.nodeId, table.createdAt),
    index("generation_tasks_table_cell_created_at_idx").on(table.tableCellId, table.createdAt),
    index("generation_tasks_table_row_created_at_idx").on(table.tableRowId, table.createdAt),
    index("generation_tasks_table_column_created_at_idx").on(table.tableColumnId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.canvasId, table.nodeId, table.tableRowId],
      foreignColumns: [tableNodeRows.workspaceId, tableNodeRows.canvasId, tableNodeRows.nodeId, tableNodeRows.id],
      name: "generation_tasks_table_row_scope_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.canvasId, table.nodeId, table.tableColumnId],
      foreignColumns: [tableNodeColumns.workspaceId, tableNodeColumns.canvasId, tableNodeColumns.nodeId, tableNodeColumns.id],
      name: "generation_tasks_table_column_scope_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.canvasId, table.nodeId, table.tableCellId],
      foreignColumns: [tableNodeCells.workspaceId, tableNodeCells.canvasId, tableNodeCells.nodeId, tableNodeCells.id],
      name: "generation_tasks_table_cell_scope_fk",
    }),
    check(
      "generation_tasks_table_cell_requires_scope",
      sql`${table.tableCellId} is null or (${table.canvasId} is not null and ${table.nodeId} is not null and ${table.tableRowId} is not null and ${table.tableColumnId} is not null)`,
    ),
  ],
);

export const taskResults = pgTable(
  "task_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => generationTasks.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    batchRunId: uuid("batch_run_id").references(() => nodeRunBatches.id),
    nodeRunId: uuid("node_run_id").references(() => nodeRuns.id),
    nodeId: uuid("node_id").references(() => canvasNodes.id),
    combinationPlanId: uuid("combination_plan_id").references(() => combinationPlans.id),
    combinationItemId: uuid("combination_item_id").references(() => combinationItems.id),
    combinationShardId: uuid("combination_shard_id").references(() => combinationShards.id),
    tableCellId: uuid("table_cell_id"),
    resultType: varchar("result_type", { length: 20 }).notNull(),
    contentText: text("content_text"),
    assetId: uuid("asset_id"),
    sourceBatchItemKey: varchar("source_batch_item_key", { length: 160 }),
    displayOrder: integer("display_order"),
    inputBindingSummaryJson: jsonb("input_binding_summary_json").$type<Record<string, unknown>[]>().notNull().default([]),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("task_results_task_id_idx").on(table.taskId),
    index("task_results_workspace_type_idx").on(table.workspaceId, table.resultType),
    index("task_results_combination_item_idx").on(table.combinationItemId, table.nodeId, table.createdAt),
    index("task_results_table_cell_idx").on(table.tableCellId),
    foreignKey({
      columns: [table.workspaceId, table.tableCellId],
      foreignColumns: [tableNodeCells.workspaceId, tableNodeCells.id],
      name: "task_results_table_cell_scope_fk",
    }),
  ],
);

export const providerConfigs = pgTable("provider_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 50 }).notNull(),
  capability: varchar("capability", { length: 20 }).notNull(),
  modelKey: varchar("model_key", { length: 100 }).notNull(),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const adapterConfigs = pgTable("adapter_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adapterKey: varchar("adapter_key", { length: 100 }).notNull(),
  capability: varchar("capability", { length: 20 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  rateLimitJson: jsonb("rate_limit_json").$type<Record<string, unknown>>().notNull().default({}),
  fallbackJson: jsonb("fallback_json").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: uuid("actor_id"),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: uuid("target_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schema = {
  users,
  workspaces,
  workspaceMembers,
  userSessions,
  products,
  modelProfiles,
  libraryItems,
  instructionPresets,
  assets,
  canvases,
  canvasNodes,
  canvasEdges,
  nodeTemplates,
  workflowTemplates,
  tableNodeRows,
  tableNodeColumns,
  tableNodeCells,
  inputNodeItems,
  nodeRunBatches,
  combinationPlans,
  combinationItems,
  combinationShards,
  nodeRuns,
  generationTasks,
  taskResults,
  providerConfigs,
  adapterConfigs,
  auditLogs,
};

export type DatabaseSchema = typeof schema;
