ALTER TABLE "node_run_batches" ADD COLUMN "result_node_id" uuid;
--> statement-breakpoint
ALTER TABLE "node_run_batches" ADD CONSTRAINT "node_run_batches_result_node_id_canvas_nodes_id_fk" FOREIGN KEY ("result_node_id") REFERENCES "public"."canvas_nodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "node_run_batches_result_node_idx" ON "node_run_batches" USING btree ("result_node_id");
