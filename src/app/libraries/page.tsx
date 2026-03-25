import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { InstructionPresetPanel } from "@/components/workspace/instruction-preset-panel";
import { LibraryItemPanel } from "@/components/workspace/library-item-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LibrariesPageProps = {
  searchParams?: Promise<{
    workspaceId?: string;
  }>;
};

const roleLabel = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
} as const;

function actionLinkClass(active: boolean) {
  return active
    ? "inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex items-center rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted";
}

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags.join(" · ") : "未设置标签";
}

export default async function LibrariesPage({ searchParams }: LibrariesPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/libraries", {
    headers: {
      cookie: cookieStore.toString(),
    },
  });

  let currentUserResult: Awaited<ReturnType<typeof getCurrentUserFromRequest>> | null = null;

  try {
    currentUserResult = await getCurrentUserFromRequest(request);
  } catch {
    currentUserResult = null;
  }

  if (!currentUserResult) {
    return (
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <Badge>资源库</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后查看主体库、场景库与指令库</h1>
            <p className="text-base leading-7 text-muted-foreground">
              资源库依赖当前会话来解析 workspace 归属、权限范围以及 personal / workspace 级别的指令可见性。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link className={actionLinkClass(true)} href="/login">
              去登录
            </Link>
            <Link className={actionLinkClass(false)} href="/register">
              去注册
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeWorkspace =
    currentUserResult.workspaces.find((workspace) => workspace.id === resolvedSearchParams?.workspaceId) ??
    currentUserResult.workspaces.find((workspace) => workspace.type === "personal") ??
    currentUserResult.workspaces[0];
  const canEdit = activeWorkspace.role === "owner" || activeWorkspace.role === "admin" || activeWorkspace.role === "editor";

  const [subjects, scenes, instructionPresets] = await Promise.all([
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "subject" }),
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "scene" }),
    listInstructionPresets({ workspaceId: activeWorkspace.id, userId: currentUserResult.user.id }),
  ]);

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>统一资源库</Badge>
                <Badge variant="outline">{activeWorkspace.name}</Badge>
                <Badge variant="outline">{roleLabel[activeWorkspace.role as keyof typeof roleLabel]}</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">主体、场景、指令三层资源开始统一设计</h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  主体库承接原来的产品与模特语义，场景库复用同一套底层数据结构，指令库沉淀可重复调用的 prompt 预制件。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className={actionLinkClass(true)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                进入画布
              </Link>
              <Link className={actionLinkClass(false)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                返回工作台
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>主体数量</CardDescription>
              <CardTitle className="text-2xl">{subjects.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>场景数量</CardDescription>
              <CardTitle className="text-2xl">{scenes.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>指令数量</CardDescription>
              <CardTitle className="text-2xl">{instructionPresets.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>当前权限</CardDescription>
              <CardTitle className="text-2xl">{canEdit ? "可编辑" : "只读"}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>主体库</CardTitle>
              <CardDescription>把商品主体、人物主体、IP 主体统一抽象为 subject。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LibraryItemPanel disabled={!canEdit} kind="subject" workspaceId={activeWorkspace.id} />
              <div className="space-y-3">
                {subjects.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                    当前空间还没有主体资源。
                  </div>
                ) : (
                  subjects.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.description?.trim() || "未填写主体说明。"}</p>
                        </div>
                        <Badge variant="outline">{item.entityType ?? "subject"}</Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{formatTags(item.tags)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>场景库</CardTitle>
              <CardDescription>管理棚景、环境、布光、陈列等镜头环境资源。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LibraryItemPanel disabled={!canEdit} kind="scene" workspaceId={activeWorkspace.id} />
              <div className="space-y-3">
                {scenes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                    当前空间还没有场景资源。
                  </div>
                ) : (
                  scenes.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.description?.trim() || "未填写场景说明。"}</p>
                        </div>
                        <Badge variant="outline">{item.entityType ?? "scene"}</Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{formatTags(item.tags)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>指令库</CardTitle>
              <CardDescription>沉淀文生图、图生图节点的预制 prompt 与 negative prompt。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <InstructionPresetPanel disabled={!canEdit} workspaceId={activeWorkspace.id} />
              <div className="space-y-3">
                {instructionPresets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                    当前空间还没有可复用指令。
                  </div>
                ) : (
                  instructionPresets.map((preset) => (
                    <div key={preset.id} className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{preset.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {preset.description?.trim() || "未填写指令说明。"}
                          </p>
                        </div>
                        <Badge variant="outline">{preset.scope}</Badge>
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{preset.promptTemplate}</p>
                      {preset.negativePrompt ? (
                        <p className="mt-2 text-xs text-muted-foreground">Negative: {preset.negativePrompt}</p>
                      ) : null}
                      <p className="mt-3 text-xs text-muted-foreground">{formatTags(preset.tags)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
