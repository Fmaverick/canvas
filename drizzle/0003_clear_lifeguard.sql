CREATE TABLE "node_run_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"mode" varchar(20) NOT NULL,
	"status" varchar(30) DEFAULT 'processing' NOT NULL,
	"requested_run_count" integer DEFAULT 1 NOT NULL,
	"total_node_run_count" integer DEFAULT 0 NOT NULL,
	"completed_node_run_count" integer DEFAULT 0 NOT NULL,
	"succeeded_node_run_count" integer DEFAULT 0 NOT NULL,
	"failed_node_run_count" integer DEFAULT 0 NOT NULL,
	"selected_nodes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"batch_run_id" uuid,
	"task_id" uuid,
	"request_id" varchar(100) NOT NULL,
	"run_index" integer,
	"node_type" varchar(20) NOT NULL,
	"node_title" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"result_type" varchar(20),
	"content_text" text,
	"asset_id" uuid,
	"result_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "node_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "batch_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "batch_run_index" integer;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD CONSTRAINT "node_run_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD CONSTRAINT "node_run_batches_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD CONSTRAINT "node_run_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_node_id_canvas_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_runs" ADD CONSTRAINT "node_runs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_run_batches_workspace_created_at_idx" ON "node_run_batches" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "node_run_batches_canvas_created_at_idx" ON "node_run_batches" USING btree ("canvas_id","created_at");--> statement-breakpoint
CREATE INDEX "node_run_batches_status_idx" ON "node_run_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "node_runs_request_id_unique" ON "node_runs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "node_runs_workspace_created_at_idx" ON "node_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "node_runs_batch_run_idx" ON "node_runs" USING btree ("batch_run_id","run_index");--> statement-breakpoint
CREATE INDEX "node_runs_node_created_at_idx" ON "node_runs" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE INDEX "node_runs_status_idx" ON "node_runs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_node_run_id_node_runs_id_fk" FOREIGN KEY ("node_run_id") REFERENCES "public"."node_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_batch_run_id_node_run_batches_id_fk" FOREIGN KEY ("batch_run_id") REFERENCES "public"."node_run_batches"("id") ON DELETE no action ON UPDATE no action;
