import {
  boolean,
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
      .$type<{ productIds?: string[]; modelProfileIds?: string[]; assetIds?: string[] }>()
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
      .$type<{ productIds?: string[]; modelProfileIds?: string[]; assetIds?: string[] }>()
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

export const generationTasks = pgTable(
  "generation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    canvasId: uuid("canvas_id").references(() => canvases.id),
    nodeId: uuid("node_id").references(() => canvasNodes.id),
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
    index("generation_tasks_node_created_at_idx").on(table.nodeId, table.createdAt),
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
    resultType: varchar("result_type", { length: 20 }).notNull(),
    contentText: text("content_text"),
    assetId: uuid("asset_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("task_results_task_id_idx").on(table.taskId), index("task_results_workspace_type_idx").on(table.workspaceId, table.resultType)],
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
  assets,
  canvases,
  canvasNodes,
  canvasEdges,
  nodeTemplates,
  generationTasks,
  taskResults,
  providerConfigs,
  adapterConfigs,
  auditLogs,
};

export type DatabaseSchema = typeof schema;
