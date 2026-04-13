CREATE TABLE "table_node_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"row_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'idle' NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_text" text,
	"asset_id" uuid,
	"result_type" varchar(20),
	"result_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latest_task_id" uuid,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_node_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"column_order" integer NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"dependency_column_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_node_columns_order_non_negative" CHECK ("table_node_columns"."column_order" >= 0),
	CONSTRAINT "table_node_columns_dependency_ids_array" CHECK (jsonb_typeof("table_node_columns"."dependency_column_ids") = 'array')
);
--> statement-breakpoint
CREATE TABLE "table_node_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"row_order" integer NOT NULL,
	"status" varchar(30) DEFAULT 'idle' NOT NULL,
	"source_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_node_rows_order_non_negative" CHECK ("table_node_rows"."row_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "table_row_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "table_column_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "table_cell_id" uuid;--> statement-breakpoint
ALTER TABLE "task_results" ADD COLUMN "table_cell_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_columns_node_key_unique" ON "table_node_columns" USING btree ("node_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_columns_node_order_unique" ON "table_node_columns" USING btree ("node_id","column_order");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_columns_workspace_canvas_node_id_unique" ON "table_node_columns" USING btree ("workspace_id","canvas_id","node_id","id");--> statement-breakpoint
CREATE INDEX "table_node_columns_node_order_idx" ON "table_node_columns" USING btree ("node_id","column_order");--> statement-breakpoint
CREATE INDEX "table_node_columns_workspace_node_kind_idx" ON "table_node_columns" USING btree ("workspace_id","node_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_rows_node_order_unique" ON "table_node_rows" USING btree ("node_id","row_order");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_rows_workspace_canvas_node_id_unique" ON "table_node_rows" USING btree ("workspace_id","canvas_id","node_id","id");--> statement-breakpoint
CREATE INDEX "table_node_rows_node_order_idx" ON "table_node_rows" USING btree ("node_id","row_order");--> statement-breakpoint
CREATE INDEX "table_node_rows_workspace_node_status_idx" ON "table_node_rows" USING btree ("workspace_id","node_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_cells_row_column_unique" ON "table_node_cells" USING btree ("row_id","column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_cells_workspace_canvas_node_id_unique" ON "table_node_cells" USING btree ("workspace_id","canvas_id","node_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_node_cells_workspace_id_id_unique" ON "table_node_cells" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "table_node_cells_node_row_idx" ON "table_node_cells" USING btree ("node_id","row_id");--> statement-breakpoint
CREATE INDEX "table_node_cells_node_column_idx" ON "table_node_cells" USING btree ("node_id","column_id");--> statement-breakpoint
CREATE INDEX "table_node_cells_workspace_node_status_idx" ON "table_node_cells" USING btree ("workspace_id","node_id","status");--> statement-breakpoint
CREATE INDEX "table_node_cells_latest_task_idx" ON "table_node_cells" USING btree ("latest_task_id");--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_row_scope_fk" FOREIGN KEY ("workspace_id","canvas_id","node_id","row_id") REFERENCES "public"."table_node_rows"("workspace_id","canvas_id","node_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_cells" ADD CONSTRAINT "table_node_cells_column_scope_fk" FOREIGN KEY ("workspace_id","canvas_id","node_id","column_id") REFERENCES "public"."table_node_columns"("workspace_id","canvas_id","node_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_columns" ADD CONSTRAINT "table_node_columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_columns" ADD CONSTRAINT "table_node_columns_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_columns" ADD CONSTRAINT "table_node_columns_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_rows" ADD CONSTRAINT "table_node_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_rows" ADD CONSTRAINT "table_node_rows_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_node_rows" ADD CONSTRAINT "table_node_rows_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_table_row_scope_fk" FOREIGN KEY ("workspace_id","canvas_id","node_id","table_row_id") REFERENCES "public"."table_node_rows"("workspace_id","canvas_id","node_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_table_column_scope_fk" FOREIGN KEY ("workspace_id","canvas_id","node_id","table_column_id") REFERENCES "public"."table_node_columns"("workspace_id","canvas_id","node_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_table_cell_scope_fk" FOREIGN KEY ("workspace_id","canvas_id","node_id","table_cell_id") REFERENCES "public"."table_node_cells"("workspace_id","canvas_id","node_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_table_cell_scope_fk" FOREIGN KEY ("workspace_id","table_cell_id") REFERENCES "public"."table_node_cells"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_tasks_table_cell_created_at_idx" ON "generation_tasks" USING btree ("table_cell_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_tasks_table_row_created_at_idx" ON "generation_tasks" USING btree ("table_row_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_tasks_table_column_created_at_idx" ON "generation_tasks" USING btree ("table_column_id","created_at");--> statement-breakpoint
CREATE INDEX "task_results_table_cell_idx" ON "task_results" USING btree ("table_cell_id");--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_table_cell_requires_scope" CHECK ("generation_tasks"."table_cell_id" is null or ("generation_tasks"."canvas_id" is not null and "generation_tasks"."node_id" is not null and "generation_tasks"."table_row_id" is not null and "generation_tasks"."table_column_id" is not null));
