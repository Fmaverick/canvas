"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type WorkflowTemplateItem = {
  id: string;
  workspaceId: string;
  createdBy: string;
  scope: "personal" | "workspace";
  name: string;
  description: string | null;
  effectCategory: string | null;
  contentCategory: string | null;
  tags: string[];
  usageCount: number;
  status: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
};

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? fallbackMessage);
  }

  return payload.data as T;
}

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted";
}

export default function WorkflowTemplatesPage() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const canvasId = searchParams.get("canvasId") ?? "";
  const [templates, setTemplates] = useState<WorkflowTemplateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftScope, setDraftScope] = useState<"personal" | "workspace">("personal");
  const [draftEffectCategory, setDraftEffectCategory] = useState("");
  const [draftContentCategory, setDraftContentCategory] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  const canCreateFromCanvas = workspaceId.length > 0 && canvasId.length > 0;

  const normalizedTags = useMemo(
    () =>
      Array.from(
        new Set(
          draftTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    [draftTags],
  );

  async function loadTemplates() {
    if (!workspaceId) {
      setTemplates([]);
      setIsLoading(false);

      return;
    }

    setIsLoading(true);

    try {
      const data = await parseResponse<WorkflowTemplateItem[]>(
        await fetch("/api/workflow-templates", {
          headers: {
            "x-workspace-id": workspaceId,
          },
          cache: "no-store",
        }),
        "加载工作流模板失败。",
      );
      setTemplates(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载工作流模板失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, [workspaceId]);

  async function handleCreateTemplate() {
    if (!canCreateFromCanvas) {
      toast.error("请从具体画布进入后再保存工作流模板。");

      return;
    }

    setIsSubmitting(true);

    try {
      await parseResponse(
        await fetch("/api/workflow-templates", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            sourceCanvasId: canvasId,
            scope: draftScope,
            name: draftName,
            description: draftDescription,
            effectCategory: draftEffectCategory,
            contentCategory: draftContentCategory,
            tags: normalizedTags,
          }),
        }),
        "保存工作流模板失败。",
      );
      toast.success("工作流模板已保存。");
      setIsCreateOpen(false);
      setDraftName("");
      setDraftDescription("");
      setDraftEffectCategory("");
      setDraftContentCategory("");
      setDraftTags("");
      await loadTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存工作流模板失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApplyTemplate(templateId: string) {
    if (!canvasId || !workspaceId) {
      toast.error("请先指定要应用的画布。");

      return;
    }

    setApplyingTemplateId(templateId);

    try {
      await parseResponse(
        await fetch(`/api/workflow-templates/${templateId}/apply`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            canvasId,
          }),
        }),
        "套用工作流模板失败。",
      );
      toast.success("工作流模板已插入当前画布。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "套用工作流模板失败。");
    } finally {
      setApplyingTemplateId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px]">
        <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <div className="border-b border-black/5 bg-[#fcfcfd] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-[#ff5f57]" />
                  <span className="size-3 rounded-full bg-[#febc2e]" />
                  <span className="size-3 rounded-full bg-[#28c840]" />
                  <div className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-foreground">
                      Workflow Templates
                    </span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">封装工作流</h1>
                  <p className="text-sm text-muted-foreground">
                    首版支持个人模板和空间模板，从当前画布保存模板，并一键插入节点和边到目标画布。<mccoremem id="03fwojl0nvnukc12ua4m2g1a4" />
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {workspaceId ? (
                  <Link className={actionLinkClass(false)} href={`/canvases?workspaceId=${workspaceId}`}>
                    返回画布
                  </Link>
                ) : null}
                <Button disabled={!canCreateFromCanvas} onClick={() => setIsCreateOpen(true)}>
                  <Plus className="size-4" />
                  从当前画布保存模板
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 bg-white px-5 py-5 sm:px-6">
              {isLoading ? (
                <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-10 text-sm text-muted-foreground">
                  正在加载工作流模板...
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-10 text-sm text-muted-foreground">
                  当前还没有工作流模板。{canCreateFromCanvas ? "可以从当前画布保存第一个模板。" : "请从画布页进入后保存模板。"}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {templates.map((template) => (
                    <article key={template.id} className="rounded-[22px] border border-black/5 bg-[#fcfcfd] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium text-foreground">{template.name}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {template.description?.trim() || "该模板由当前工作流快照生成，适合重复套用。"}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                          {template.scope === "workspace" ? "空间模板" : "个人模板"}
                        </Badge>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {template.effectCategory ? <span className="rounded-full bg-white px-2 py-1">画面效果：{template.effectCategory}</span> : null}
                        {template.contentCategory ? <span className="rounded-full bg-white px-2 py-1">内容类型：{template.contentCategory}</span> : null}
                        <span className="rounded-full bg-white px-2 py-1">{template.nodeCount} 节点</span>
                        <span className="rounded-full bg-white px-2 py-1">{template.edgeCount} 连线</span>
                      </div>

                      {template.tags.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {template.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-black/8 bg-white px-2 py-1 text-xs text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">已套用 {template.usageCount} 次</p>
                        <div className="flex flex-wrap gap-2">
                          {canvasId ? (
                            <Button
                              disabled={applyingTemplateId === template.id}
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => void handleApplyTemplate(template.id)}
                            >
                              <Sparkles className="size-4" />
                              {applyingTemplateId === template.id ? "套用中..." : "应用到当前画布"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside className="border-t border-black/5 bg-[#fafafb] p-5 sm:p-6 xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <div className="rounded-[20px] border border-black/5 bg-white p-5">
                  <p className="text-sm font-medium text-foreground">当前范围</p>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>模板范围：个人模板 + 空间模板</p>
                    <p>固定分类：画面效果、内容类型</p>
                    <p>套用行为：完整插入节点和边</p>
                  </div>
                </div>
                <div className="rounded-[20px] border border-black/5 bg-white p-5">
                  <p className="text-sm font-medium text-foreground">创建方式</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    先在画布中搭好完整工作流，再进入此页面保存为模板。首版默认从当前画布生成快照模板。
                  </p>
                </div>
                {canvasId ? (
                  <div className="rounded-[20px] border border-black/5 bg-white p-5">
                    <p className="text-sm font-medium text-foreground">当前目标</p>
                    <p className="mt-3 text-sm text-muted-foreground break-all">画布 ID：{canvasId}</p>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>保存工作流模板</DialogTitle>
            <DialogDescription>从当前画布保存一份可重复套用的工作流模板。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>模板名称</span>
                <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label className="space-y-2 text-sm">
                <span>模板范围</span>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draftScope}
                  onChange={(event) => setDraftScope(event.target.value as "personal" | "workspace")}
                >
                  <option value="personal">个人模板</option>
                  <option value="workspace">空间模板</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>画面效果</span>
                <Input placeholder="例如：高级感、纪实感、极简白底" value={draftEffectCategory} onChange={(event) => setDraftEffectCategory(event.target.value)} />
              </label>
              <label className="space-y-2 text-sm">
                <span>内容类型</span>
                <Input placeholder="例如：服装图、配饰图、开箱视频" value={draftContentCategory} onChange={(event) => setDraftContentCategory(event.target.value)} />
              </label>
            </div>
            <label className="space-y-2 text-sm">
              <span>标签</span>
              <Input placeholder="多个标签用逗号分隔" value={draftTags} onChange={(event) => setDraftTags(event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span>模板描述</span>
              <Textarea className="min-h-28 resize-none" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={isSubmitting || draftName.trim().length === 0 || !canCreateFromCanvas} onClick={() => void handleCreateTemplate()}>
              {isSubmitting ? "保存中..." : "保存模板"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
