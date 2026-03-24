"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CreateCanvasPanelProps = {
  workspaceId: string;
};

export function CreateCanvasPanel({ workspaceId }: CreateCanvasPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createCanvas() {
    if (!name.trim()) {
      toast.error("请输入画布名称。");

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/canvases", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "创建画布失败。");
      }

      const canvasId = result?.data?.id;

      setName("");
      setDescription("");
      toast.success("画布已创建。");

      if (typeof canvasId === "string") {
        router.push(`/canvases/${canvasId}?workspaceId=${workspaceId}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建画布失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="canvas-name">画布名称</Label>
        <Input
          id="canvas-name"
          placeholder="例如：夏季新品营销工作流"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="canvas-description">画布说明</Label>
        <Textarea
          id="canvas-description"
          placeholder="描述这个画布的用途、节点规划或当前要跑的内容主题"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <Button disabled={isSubmitting} type="button" onClick={createCanvas}>
        {isSubmitting ? "创建中..." : "创建画布"}
      </Button>
    </div>
  );
}
