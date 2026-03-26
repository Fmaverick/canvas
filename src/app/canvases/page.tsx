import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { CreateCanvasPanel } from "@/components/canvas/create-canvas-panel";
import { Badge } from "@/components/ui/badge";

type CanvasesPageProps = {
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

const roleDescription = {
  owner: "拥有完整空间权限，可管理成员、编辑资源并发起生成。",
  admin: "可管理成员，可编辑资源并发起生成。",
  editor: "可编辑资源并发起生成，但不能管理成员。",
  viewer: "只读访问，可查看任务与资源状态。",
} as const;

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted";
}

function workspaceLinkClass(active: boolean) {
  return active
    ? "inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-[0_8px_24px_-24px_rgba(15,23,42,0.24)]"
    : "inline-flex items-center rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition hover:border-black/8 hover:bg-white";
}

function surfaceClassName(compact = false) {
  return compact
    ? "rounded-[20px] border border-black/5 bg-white p-4"
    : "rounded-[24px] border border-black/5 bg-white p-5 sm:p-6";
}

function canvasStatusTone(status: string) {
  if (status === "active") {
    return "bg-[#f2f8f3] text-[#166534]";
  }

  if (status === "draft") {
    return "bg-[#f5f7ff] text-[#344054]";
  }

  return "bg-[#f4f4f5] text-[#52525b]";
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
      <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col items-center justify-center gap-6 rounded-[28px] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <Badge variant="outline" className="border-black/8 bg-[#fcfcfd] text-foreground">
            画布中心
          </Badge>
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
  const totalCanvases = canvases.length;
  const activeCanvasCount = canvases.filter((canvas) => canvas.status === "active").length;
  const draftCanvasCount = canvases.filter((canvas) => canvas.status === "draft").length;
  const archivedCanvasCount = canvases.filter((canvas) => canvas.status === "archived").length;
  const lastUpdatedCanvas = canvases.reduce<(typeof canvases)[number] | null>((latest, canvas) => {
    if (!latest) {
      return canvas;
    }

    return canvas.updatedAt.getTime() > latest.updatedAt.getTime() ? canvas : latest;
  }, null);
  const overviewStats = [
    { label: "当前空间", value: activeWorkspace.name, accent: "bg-[#f7f7f8]" },
    {
      label: "当前角色",
      value: roleLabel[activeWorkspace.role as keyof typeof roleLabel],
      accent: "bg-[#f7f7f8]",
    },
    { label: "活跃 / 草稿", value: `${activeCanvasCount} / ${draftCanvasCount}`, accent: "bg-[#f5f7ff]" },
    { label: "归档画布", value: String(archivedCanvasCount), accent: "bg-[#f7f7f8]" },
  ];

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px]">
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
                      Canvas Center
                    </span>
                    <span className="hidden sm:inline">{activeWorkspace.name}</span>
                    <span className="hidden rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs sm:inline">
                      {roleLabel[activeWorkspace.role as keyof typeof roleLabel]}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    创建并管理你的画布工作流
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    保留新建入口、现有画布和 workspace 上下文，浏览节奏与工作台保持一致。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link className={actionLinkClass(true)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                  返回工作台
                </Link>
                <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                  查看任务中心
                </Link>
                <Link className={actionLinkClass(false)} href="/">
                  返回首页
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <section className="min-w-0 bg-white">
              <div className="border-b border-black/5 px-5 py-5 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {overviewStats.map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                      <div className={`inline-flex rounded-full px-2 py-1 text-xs text-muted-foreground ${item.accent}`}>
                        {item.label}
                      </div>
                      <p className="mt-4 text-xl font-semibold tracking-tight text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">新建画布</p>
                    <p className="text-sm text-muted-foreground">创建后直接进入详情页，继续添加节点与运行任务。</p>
                  </div>

                  <div className="mt-5 rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4 sm:p-5">
                    <CreateCanvasPanel workspaceId={activeWorkspace.id} />
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">当前空间画布</p>
                      <p className="text-sm text-muted-foreground">从这里继续进入已有画布，查看节点、边和运行历史。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {totalCanvases}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {canvases.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-8 text-sm text-muted-foreground">
                        当前空间还没有画布，先在左侧创建第一个画布。
                      </div>
                    ) : (
                      canvases.map((canvas) => (
                        <Link
                          key={canvas.id}
                          className="block rounded-[20px] border border-black/5 bg-[#fcfcfd] px-4 py-4 transition hover:border-black/10 hover:bg-white"
                          href={`/canvases/${canvas.id}?workspaceId=${activeWorkspace.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate font-medium text-foreground">{canvas.name}</p>
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {canvas.description?.trim() || "进入画布详情继续配置节点、节点状态和任务运行链路。"}
                              </p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${canvasStatusTone(canvas.status)}`}>
                              {canvas.status}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>更新时间 {formatDateTime(canvas.updatedAt)}</span>
                            <span>版本入口已就绪</span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            <aside className="border-t border-black/5 bg-[#fafafb] p-5 sm:p-6 xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">当前用户</p>
                    <p className="text-sm text-muted-foreground">画布创建和列表加载都依赖当前会话与 workspace 权限。</p>
                  </div>

                  <div className="mt-4 rounded-[20px] bg-[#fcfcfd] p-4">
                    <p className="font-medium text-foreground">{currentUserResult.user.name ?? "未命名用户"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{currentUserResult.user.email}</p>
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">空间切换</p>
                      <p className="text-sm text-muted-foreground">保持轻量切换，避免离开画布中心再回跳。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {currentUserResult.workspaces.length}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {currentUserResult.workspaces.map((workspace) => (
                      <Link
                        key={workspace.id}
                        className={workspaceLinkClass(workspace.id === activeWorkspace.id)}
                        href={`/canvases?workspaceId=${workspace.id}`}
                      >
                        {workspace.name}
                      </Link>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[20px] bg-[#fcfcfd] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                        {activeWorkspace.type === "personal" ? "Personal" : "Team"}
                      </Badge>
                      <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                        {roleLabel[activeWorkspace.role as keyof typeof roleLabel]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {roleDescription[activeWorkspace.role as keyof typeof roleDescription]}
                    </p>
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">画布节奏</p>
                    <p className="text-sm text-muted-foreground">先创建，再进入详情页配置节点、边和运行状态。</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                      <p className="text-xs text-muted-foreground">最近更新时间</p>
                      <p className="mt-2 font-medium text-foreground">
                        {lastUpdatedCanvas ? formatDateTime(lastUpdatedCanvas.updatedAt) : "—"}
                      </p>
                    </div>
                    <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                      <p className="text-xs text-muted-foreground">入口建议</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link className={actionLinkClass(false)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                          工作台
                        </Link>
                        <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                          任务中心
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
