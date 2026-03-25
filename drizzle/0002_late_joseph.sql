CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"entity_type" varchar(30),
	"name" varchar(255) NOT NULL,
	"description" text,
	"cover_asset_id" uuid,
	"prompt_hints" text,
	"profile_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruction_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"created_by" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"prompt_template" text NOT NULL,
	"negative_prompt" text,
	"variable_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_presets" ADD CONSTRAINT "instruction_presets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_presets" ADD CONSTRAINT "instruction_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_items_workspace_kind_status_idx" ON "library_items" USING btree ("workspace_id","kind","status");--> statement-breakpoint
CREATE INDEX "library_items_workspace_name_idx" ON "library_items" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "instruction_presets_created_scope_idx" ON "instruction_presets" USING btree ("created_by","scope");--> statement-breakpoint
CREATE INDEX "instruction_presets_workspace_scope_status_idx" ON "instruction_presets" USING btree ("workspace_id","scope","status");
