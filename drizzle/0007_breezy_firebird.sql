CREATE TABLE "combination_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"batch_run_id" uuid,
	"plan_id" uuid NOT NULL,
	"shard_id" uuid,
	"item_index" integer NOT NULL,
	"stable_key" varchar(160) NOT NULL,
	"display_label" varchar(255) NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"binding_summary_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_bindings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_batch_item_key" varchar(160),
	"display_order" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_node_id" uuid,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combination_items_item_index_non_negative" CHECK ("combination_items"."item_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "combination_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"combination_node_id" uuid NOT NULL,
	"batch_run_id" uuid,
	"created_by" uuid NOT NULL,
	"mode" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"governance_action" varchar(30),
	"governance_signals_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_node_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_preview_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_combination_count" integer DEFAULT 0 NOT NULL,
	"total_item_count" integer DEFAULT 0 NOT NULL,
	"completed_item_count" integer DEFAULT 0 NOT NULL,
	"succeeded_item_count" integer DEFAULT 0 NOT NULL,
	"failed_item_count" integer DEFAULT 0 NOT NULL,
	"total_shard_count" integer DEFAULT 0 NOT NULL,
	"completed_shard_count" integer DEFAULT 0 NOT NULL,
	"succeeded_shard_count" integer DEFAULT 0 NOT NULL,
	"failed_shard_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combination_shards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"batch_run_id" uuid,
	"plan_id" uuid NOT NULL,
	"shard_index" integer NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"item_start_index" integer DEFAULT 0 NOT NULL,
	"item_end_index" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"completed_item_count" integer DEFAULT 0 NOT NULL,
	"succeeded_item_count" integer DEFAULT 0 NOT NULL,
	"failed_item_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combination_shards_shard_index_non_negative" CHECK ("combination_shards"."shard_index" >= 0),
	CONSTRAINT "combination_shards_item_start_index_non_negative" CHECK ("combination_shards"."item_start_index" >= 0),
	CONSTRAINT "combination_shards_item_end_index_non_negative" CHECK ("combination_shards"."item_end_index" >= 0),
	CONSTRAINT "combination_shards_item_count_non_negative" CHECK ("combination_shards"."item_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "input_node_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"stable_key" varchar(160) NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"display_label" varchar(255) NOT NULL,
	"content_text" text,
	"asset_id" uuid,
	"source_ref_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "input_node_items_sort_order_non_negative" CHECK ("input_node_items"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "combination_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "combination_item_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "combination_shard_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "source_batch_item_key" varchar(160);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "display_order" integer;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "batch_mode" varchar(30) DEFAULT 'repeat' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "target_node_type" varchar(20);--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "derive_strategy" varchar(30);--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "template_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "total_combination_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "completed_combination_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "succeeded_combination_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "failed_combination_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "total_shard_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD COLUMN "completed_shard_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "combination_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "combination_item_id" uuid;--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "combination_shard_id" uuid;--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "derived_target_node_id" uuid;--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "source_batch_item_key" varchar(160);--> statement-breakpoint
ALTER TABLE "node_runs" ADD COLUMN "display_order" integer;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "batch_run_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "node_run_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "node_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "combination_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "combination_item_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "combination_shard_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "source_batch_item_key" varchar(160);--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "display_order" integer;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "input_binding_summary_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_plan_id_combination_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."combination_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_shard_id_combination_shards_id_fk" FOREIGN KEY ("shard_id") REFERENCES "public"."combination_shards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_items" ADD CONSTRAINT "combination_items_last_error_node_id_canvas_nodes_id_fk" FOREIGN KEY ("last_error_node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_plans" ADD CONSTRAINT "combination_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_plans" ADD CONSTRAINT "combination_plans_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_plans" ADD CONSTRAINT "combination_plans_combination_node_id_canvas_nodes_id_fk" FOREIGN KEY ("combination_node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_plans" ADD CONSTRAINT "combination_plans_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_plans" ADD CONSTRAINT "combination_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_shards" ADD CONSTRAINT "combination_shards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_shards" ADD CONSTRAINT "combination_shards_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_shards" ADD CONSTRAINT "combination_shards_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_shards" ADD CONSTRAINT "combination_shards_plan_id_combination_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."combination_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_node_items" ADD CONSTRAINT "input_node_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_node_items" ADD CONSTRAINT "input_node_items_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_node_items" ADD CONSTRAINT "input_node_items_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_node_items" ADD CONSTRAINT "input_node_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combination_items_plan_item_index_unique" ON "combination_items" USING btree ("plan_id","item_index");--> statement-breakpoint
CREATE UNIQUE INDEX "combination_items_plan_stable_key_unique" ON "combination_items" USING btree ("plan_id","stable_key");--> statement-breakpoint
CREATE INDEX "combination_items_batch_status_idx" ON "combination_items" USING btree ("batch_run_id","status");--> statement-breakpoint
CREATE INDEX "combination_items_plan_status_idx" ON "combination_items" USING btree ("plan_id","status");--> statement-breakpoint
CREATE INDEX "combination_items_shard_display_order_idx" ON "combination_items" USING btree ("shard_id","display_order");--> statement-breakpoint
CREATE INDEX "combination_plans_workspace_created_at_idx" ON "combination_plans" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "combination_plans_batch_run_idx" ON "combination_plans" USING btree ("batch_run_id");--> statement-breakpoint
CREATE INDEX "combination_plans_node_status_idx" ON "combination_plans" USING btree ("combination_node_id","status");--> statement-breakpoint
CREATE INDEX "combination_plans_status_idx" ON "combination_plans" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "combination_shards_plan_shard_index_unique" ON "combination_shards" USING btree ("plan_id","shard_index");--> statement-breakpoint
CREATE INDEX "combination_shards_batch_status_idx" ON "combination_shards" USING btree ("batch_run_id","status");--> statement-breakpoint
CREATE INDEX "combination_shards_plan_status_idx" ON "combination_shards" USING btree ("plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "input_node_items_node_stable_key_unique" ON "input_node_items" USING btree ("node_id","stable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "input_node_items_node_sort_order_unique" ON "input_node_items" USING btree ("node_id","sort_order");--> statement-breakpoint
CREATE INDEX "input_node_items_workspace_node_enabled_idx" ON "input_node_items" USING btree ("workspace_id","node_id","enabled");--> statement-breakpoint
CREATE INDEX "input_node_items_node_source_type_idx" ON "input_node_items" USING btree ("node_id","source_type");--> statement-breakpoint
CREATE INDEX "input_node_items_asset_id_idx" ON "input_node_items" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_combination_plan_id_combination_plans_id_fk" FOREIGN KEY ("combination_plan_id") REFERENCES "public"."combination_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_combination_item_id_combination_items_id_fk" FOREIGN KEY ("combination_item_id") REFERENCES "public"."combination_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_combination_shard_id_combination_shards_id_fk" FOREIGN KEY ("combination_shard_id") REFERENCES "public"."combination_shards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_combination_plan_id_combination_plans_id_fk" FOREIGN KEY ("combination_plan_id") REFERENCES "public"."combination_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_combination_item_id_combination_items_id_fk" FOREIGN KEY ("combination_item_id") REFERENCES "public"."combination_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_combination_shard_id_combination_shards_id_fk" FOREIGN KEY ("combination_shard_id") REFERENCES "public"."combination_shards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_derived_target_node_id_canvas_nodes_id_fk" FOREIGN KEY ("derived_target_node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_node_run_id_node_runs_id_fk" FOREIGN KEY ("node_run_id") REFERENCES "public"."node_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_combination_plan_id_combination_plans_id_fk" FOREIGN KEY ("combination_plan_id") REFERENCES "public"."combination_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_combination_item_id_combination_items_id_fk" FOREIGN KEY ("combination_item_id") REFERENCES "public"."combination_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_combination_shard_id_combination_shards_id_fk" FOREIGN KEY ("combination_shard_id") REFERENCES "public"."combination_shards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_tasks_combination_item_created_at_idx" ON "generation_tasks" USING btree ("combination_item_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_tasks_combination_shard_created_at_idx" ON "generation_tasks" USING btree ("combination_shard_id","created_at");--> statement-breakpoint
CREATE INDEX "node_run_batches_batch_mode_status_idx" ON "node_run_batches" USING btree ("batch_mode","status");--> statement-breakpoint
CREATE INDEX "node_runs_combination_item_idx" ON "node_runs" USING btree ("combination_item_id","node_id","created_at");--> statement-breakpoint
CREATE INDEX "node_runs_combination_shard_idx" ON "node_runs" USING btree ("combination_shard_id","display_order");--> statement-breakpoint
CREATE INDEX "task_results_combination_item_idx" ON "task_results" USING btree ("combination_item_id","node_id","created_at");