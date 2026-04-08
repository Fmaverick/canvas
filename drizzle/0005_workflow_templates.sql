CREATE TABLE "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "scope" varchar(20) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "cover_asset_id" uuid,
  "effect_category" varchar(80),
  "content_category" varchar(80),
  "snapshot_json" jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workflow_templates_workspace_scope_status_idx" ON "workflow_templates" USING btree ("workspace_id","scope","status");
--> statement-breakpoint
CREATE INDEX "workflow_templates_created_by_idx" ON "workflow_templates" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "workflow_templates_effect_category_idx" ON "workflow_templates" USING btree ("effect_category");
--> statement-breakpoint
CREATE INDEX "workflow_templates_content_category_idx" ON "workflow_templates" USING btree ("content_category");
