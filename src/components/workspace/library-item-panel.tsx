"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LibraryKind = "subject" | "scene";

type LibraryItemPanelProps = {
  workspaceId: string;
  kind: LibraryKind;
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

export function LibraryItemPanel({ workspaceId, kind, disabled = false }: LibraryItemPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState(kind === "subject" ? "product" : "studio");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [promptHints, setPromptHints] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = useMemo(
    () =>
      kind === "subject"
        ? {
            panelTitle: "新建主体",
            namePlaceholder: "例如：法式连衣裙主图主体",
            entityTypeLabel: "主体类型",
            entityTypePlaceholder: "例如：product / person / object",
            descriptionPlaceholder: "描述主体的外观、身份、卖点或镜头中的主体角色",
            promptPlaceholder: "补充该主体常用的提示词锚点，如材质、姿态、镜头偏好",
            buttonLabel: "创建主体",
          }
        : {
            panelTitle: "新建场景",
            namePlaceholder: "例如：极简白棚早餐桌面",
            entityTypeLabel: "场景类型",
            entityTypePlaceholder: "例如：studio / outdoor / room",
            descriptionPlaceholder: "描述场景的空间结构、布光、陈列与镜头氛围",
            promptPlaceholder: "补充该场景常用的环境 prompt，如光线、景深、时间段",
            buttonLabel: "创建场景",
          },
    [kind],
  );

  async function createItem() {
    if (disabled) {
      return;
    }

    if (!name.trim()) {
      toast.error(`请输入${kind === "subject" ? "主体" : "场景"}名称。`);

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/library-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          kind,
          name: name.trim(),
          entityType: entityType.trim() || undefined,
          description: description.trim() || undefined,
          promptHints: promptHints.trim() || undefined,
          tags: normalizeTags(tags),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "创建失败。");
      }

      setName("");
      setTags("");
      setDescription("");
      setPromptHints("");
      setEntityType(kind === "subject" ? "product" : "studio");
      toast.success(`${kind === "subject" ? "主体" : "场景"}已创建。`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <p className="font-medium">{copy.panelTitle}</p>
        <p className="text-sm text-muted-foreground">底层与素材附件逻辑统一，差异只体现在类型与提示词组织上。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${kind}-name`}>名称</Label>
          <Input
            id={`${kind}-name`}
            placeholder={copy.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${kind}-entity-type`}>{copy.entityTypeLabel}</Label>
          <Input
            id={`${kind}-entity-type`}
            placeholder={copy.entityTypePlaceholder}
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${kind}-tags`}>标签</Label>
        <Input
          id={`${kind}-tags`}
          placeholder="例如：电商, 女装, 高级感"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${kind}-description`}>描述</Label>
        <Textarea
          id={`${kind}-description`}
          placeholder={copy.descriptionPlaceholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${kind}-prompt-hints`}>提示词锚点</Label>
        <Textarea
          id={`${kind}-prompt-hints`}
          placeholder={copy.promptPlaceholder}
          value={promptHints}
          onChange={(event) => setPromptHints(event.target.value)}
        />
      </div>

      <Button disabled={disabled || isSubmitting} type="button" onClick={createItem}>
        {isSubmitting ? "提交中..." : copy.buttonLabel}
      </Button>
    </div>
  );
}
