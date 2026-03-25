"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateTeamWorkspacePanelProps = {
  compact?: boolean;
};

export function CreateTeamWorkspacePanel({ compact = false }: CreateTeamWorkspacePanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createTeamWorkspace() {
    if (!name.trim()) {
      toast.error("请输入团队空间名称。");

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          type: "team",
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "创建团队空间失败。");
      }

      const workspaceId = result?.data?.id;

      setName("");
      toast.success("团队空间已创建。");

      if (typeof workspaceId === "string") {
        router.push(`/dashboard?workspaceId=${workspaceId}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建团队空间失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <p className="font-medium text-foreground">创建团队空间</p>
        <p className="text-sm text-muted-foreground">创建后你会成为 owner，可继续邀请成员共享资源库、画布与任务。</p>
      </div>

      <div className={compact ? "mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" : "mt-4 space-y-3"}>
        <div className="space-y-2">
          <Label htmlFor={compact ? "team-workspace-name-compact" : "team-workspace-name"}>空间名称</Label>
          <Input
            id={compact ? "team-workspace-name-compact" : "team-workspace-name"}
            placeholder="例如：电商内容组"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <Button className={compact ? "md:min-w-32" : "w-full"} disabled={isSubmitting} type="button" onClick={createTeamWorkspace}>
          {isSubmitting ? "创建中..." : "创建团队空间"}
        </Button>
      </div>
    </div>
  );
}
