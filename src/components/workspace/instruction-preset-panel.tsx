"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InstructionPresetPanelProps = {
  workspaceId: string;
  disabled?: boolean;
};

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function InstructionPresetPanel({ workspaceId, disabled = false }: InstructionPresetPanelProps) {
  const router = useRouter();
  const [scope, setScope] = useState<"personal" | "workspace">("workspace");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createPreset() {
    if (disabled) {
      return;
    }

    if (!name.trim() || !promptTemplate.trim()) {
      toast.error("请输入指令名称和预制 prompt。");

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/instruction-presets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          scope,
          name: name.trim(),
          description: description.trim() || undefined,
          promptTemplate: promptTemplate.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          tags: normalizeTags(tags),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "创建指令失败。");
      }

      setName("");
      setTags("");
      setDescription("");
      setPromptTemplate("");
      setNegativePrompt("");
      setScope("workspace");
      toast.success("指令已创建。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建指令失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <p className="font-medium">新建指令</p>
        <p className="text-sm text-muted-foreground">把常用 prompt 抽成可复用预制件，后续可在节点里直接引用。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <Label htmlFor="instruction-name">名称</Label>
          <Input
            id="instruction-name"
            placeholder="例如：商品棚拍主视觉"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instruction-scope">作用域</Label>
          <select
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
            id="instruction-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as "personal" | "workspace")}
          >
            <option value="workspace">workspace</option>
            <option value="personal">personal</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instruction-tags">标签</Label>
        <Input
          id="instruction-tags"
          placeholder="例如：文生图, 商业摄影, 高级感"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instruction-description">说明</Label>
        <Textarea
          id="instruction-description"
          placeholder="描述这个预制 prompt 的适用场景、变量约束和调用建议"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instruction-prompt-template">预制 Prompt</Label>
        <Textarea
          id="instruction-prompt-template"
          placeholder="写入可复用的 prompt 主体，例如镜头、光线、构图、风格要求"
          value={promptTemplate}
          onChange={(event) => setPromptTemplate(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instruction-negative-prompt">负向 Prompt</Label>
        <Textarea
          id="instruction-negative-prompt"
          placeholder="可选，例如：low quality, extra fingers, blurry"
          value={negativePrompt}
          onChange={(event) => setNegativePrompt(event.target.value)}
        />
      </div>

      <Button disabled={disabled || isSubmitting} type="button" onClick={createPreset}>
        {isSubmitting ? "提交中..." : "创建指令"}
      </Button>
    </div>
  );
}
