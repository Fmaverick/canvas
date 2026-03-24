import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { CreateCanvasPanel } from "@/components/canvas/create-canvas-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CanvasesPageProps = {
  searchParams?: Promise<{
    workspaceId?: string;
  }>;
};

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex items-center rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted";
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function CanvasesPage({ searchParams }: CanvasesPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/canvases", {
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
          <Badge>画布中心</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后创建画布</h1>
            <p className="text-base leading-7 text-muted-foreground">画布创建和浏览依赖当前登录态与 workspace 上下文。</p>
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
  const canvases = await listCanvases({
    workspaceId: activeWorkspace.id,
  });

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>画布中心</Badge>
                <Badge variant="outline">{activeWorkspace.name}</Badge>
                <Badge variant="outline">{activeWorkspace.role}</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">创建并管理你的画布工作流</h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  这里是当前 workspace 的画布入口。先创建画布，再进入详情页配置节点、查看结果与重试失败任务。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className={actionLinkClass(true)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                返回工作台
              </Link>
              <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                查看任务中心
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader>
              <CardTitle>新建画布</CardTitle>
              <CardDescription>创建后会直接跳转到画布详情页，继续添加节点与运行任务。</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateCanvasPanel workspaceId={activeWorkspace.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>当前空间画布</CardTitle>
              <CardDescription>从这里继续进入已有画布，查看节点、边和运行历史。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canvases.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-sm text-muted-foreground">
                  当前空间还没有画布，先在左侧创建第一个画布。
                </div>
              ) : (
                canvases.map((canvas) => (
                  <Link
                    key={canvas.id}
                    className="block rounded-2xl border bg-muted/20 p-4 transition hover:bg-muted/40"
                    href={`/canvases/${canvas.id}?workspaceId=${activeWorkspace.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{canvas.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {canvas.description?.trim() || "进入画布详情继续配置节点和任务。"}
                        </p>
                      </div>
                      <Badge variant="outline">{canvas.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">更新时间 {formatDateTime(canvas.updatedAt)}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
