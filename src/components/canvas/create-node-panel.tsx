"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CreateNodePanelProps = {
  workspaceId: string;
  canvasId: string;
  defaultPositionX?: number;
  defaultPositionY?: number;
  defaultType?: "text" | "image" | "video" | "audio" | "storyboard";
  compact?: boolean;
  tone?: "light" | "dark";
  onCreated?: () => void;
};

export function CreateNodePanel({
  workspaceId,
  canvasId,
  defaultPositionX = 0,
  defaultPositionY = 0,
  defaultType = "text",
  compact = false,
  tone = "light",
  onCreated,
}: CreateNodePanelProps) {
  const router = useRouter();
  const [type, setType] = useState<"text" | "image" | "video" | "audio" | "storyboard">(defaultType);
  const [title, setTitle] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [positionX, setPositionX] = useState(String(defaultPositionX));
  const [positionY, setPositionY] = useState(String(defaultPositionY));
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createNode() {
    if (!title.trim()) {
      toast.error("请输入节点名称。");

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/canvases/${canvasId}/nodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          type,
          title: title.trim(),
          promptInput: promptInput.trim() || undefined,
          modelKey: modelKey.trim() || undefined,
          positionX: Number(positionX),
          positionY: Number(positionY),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "创建节点失败。");
      }

      setTitle("");
      setPromptInput("");
      setModelKey("");
      setType(defaultType);
      setPositionX(String(defaultPositionX + 280));
      setPositionY(String(defaultPositionY));
      toast.success("节点已创建。");
      onCreated?.();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建节点失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-4", tone === "dark" ? "text-white" : undefined)}>
      <div className="space-y-2">
        <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-type">
          节点类型
        </Label>
        <select
          className={cn(
            "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring",
            tone === "dark" ? "border-white/10 bg-white/5 text-white" : undefined,
          )}
          id="node-type"
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
        >
          <option value="text">Text</option>
          <option value="storyboard">Storyboard</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-title">
          节点名称
        </Label>
        <Input
          className={tone === "dark" ? "border-white/10 bg-white/5 text-white placeholder:text-white/35" : undefined}
          id="node-title"
          placeholder="例如：夏季主视觉文案"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-model">
          模型 Key
        </Label>
        <Input
          className={tone === "dark" ? "border-white/10 bg-white/5 text-white placeholder:text-white/35" : undefined}
          id="node-model"
          placeholder="例如：gemini-3-pro-preview"
          value={modelKey}
          onChange={(event) => setModelKey(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-prompt">
          Prompt
        </Label>
        <Textarea
          className={tone === "dark" ? "border-white/10 bg-white/5 text-white placeholder:text-white/35" : undefined}
          id="node-prompt"
          placeholder="输入节点 prompt，后续也可以在画布中继续调整"
          value={promptInput}
          onChange={(event) => setPromptInput(event.target.value)}
        />
      </div>

      <div className={cn("grid gap-4 md:grid-cols-2", compact ? "md:grid-cols-1" : undefined)}>
        <div className="space-y-2">
          <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-position-x">
            Position X
          </Label>
          <Input
            className={tone === "dark" ? "border-white/10 bg-white/5 text-white placeholder:text-white/35" : undefined}
            id="node-position-x"
            type="number"
            value={positionX}
            onChange={(event) => setPositionX(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className={tone === "dark" ? "text-white/80" : undefined} htmlFor="node-position-y">
            Position Y
          </Label>
          <Input
            className={tone === "dark" ? "border-white/10 bg-white/5 text-white placeholder:text-white/35" : undefined}
            id="node-position-y"
            type="number"
            value={positionY}
            onChange={(event) => setPositionY(event.target.value)}
          />
        </div>
      </div>

      <Button
        className={tone === "dark" ? "bg-cyan-500 text-black hover:bg-cyan-400" : undefined}
        disabled={isSubmitting}
        type="button"
        onClick={createNode}
      >
        {isSubmitting ? "创建中..." : "创建节点"}
      </Button>
    </div>
  );
}
