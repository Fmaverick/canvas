ALTER TABLE "assets" ADD COLUMN "volcengine_asset_id" varchar(255);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_asset_group_id" varchar(255);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_project_name" varchar(100);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_sync_status" varchar(30) DEFAULT 'not_synced' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_last_sync_error_code" varchar(100);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "volcengine_last_sync_error" text;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "volcengine_asset_group_id" varchar(255);--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "volcengine_project_name" varchar(100);