import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { listTasks } from "@/application/services/task-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardPageProps = {
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

function workspaceLinkClass(active: boolean) {
  return active
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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/dashboard", {
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
          <Badge>工作台</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后再进入工作台</h1>
            <p className="text-base leading-7 text-muted-foreground">
              当前工作台依赖会话态来解析当前用户、默认 workspace 和角色权限。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link className={workspaceLinkClass(true)} href="/login">
              去登录
            </Link>
            <Link className={workspaceLinkClass(false)} href="/register">
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

  const [tasks, canvases, subjects, scenes, instructionPresets] = await Promise.all([
    listTasks({ workspaceId: activeWorkspace.id, limit: 8 }),
    listCanvases({ workspaceId: activeWorkspace.id }),
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "subject" }),
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "scene" }),
    listInstructionPresets({ workspaceId: activeWorkspace.id, userId: currentUserResult.user.id }),
  ]);

  const runningTaskCount = tasks.filter((task) => task.status === "processing" || task.status === "queued").length;
  const failedTaskCount = tasks.filter((task) => task.status === "failed").length;
  const succeededTaskCount = tasks.filter((task) => task.status === "succeeded").length;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge>工作台</Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  欢迎回来，{currentUserResult.user.name ?? currentUserResult.user.email}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  当前工作台已经接入登录态、workspace 切换与角色控制。你可以从这里进入任务中心，并逐步承接后续的画布与协作页面。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className={workspaceLinkClass(true)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                创建 / 查看画布
              </Link>
              <Link className={workspaceLinkClass(true)} href={`/libraries?workspaceId=${activeWorkspace.id}`}>
                进入资源库
              </Link>
              <Link className={workspaceLinkClass(true)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                进入任务中心
              </Link>
              <Link className={workspaceLinkClass(false)} href="/">
                返回首页
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>当前空间</CardDescription>
              <CardTitle className="text-2xl">{activeWorkspace.name}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>当前角色</CardDescription>
              <CardTitle className="text-2xl">{roleLabel[activeWorkspace.role as keyof typeof roleLabel]}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>待处理任务</CardDescription>
              <CardTitle className="text-2xl">{runningTaskCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>最近成功 / 失败</CardDescription>
              <CardTitle className="text-2xl">
                {succeededTaskCount} / {failedTaskCount}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
          <Card>
            <CardHeader>
              <CardTitle>空间切换</CardTitle>
              <CardDescription>切换 personal / team workspace，并同步查看你的当前角色。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">当前登录用户</p>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="font-medium">{currentUserResult.user.name ?? "未命名用户"}</p>
                  <p className="text-sm text-muted-foreground">{currentUserResult.user.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">可访问空间</p>
                <div className="flex flex-wrap gap-2">
                  {currentUserResult.workspaces.map((workspace) => (
                    <Link
                      key={workspace.id}
                      className={workspaceLinkClass(workspace.id === activeWorkspace.id)}
                      href={`/dashboard?workspaceId=${workspace.id}`}
                    >
                      {workspace.name}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-background p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline">{activeWorkspace.type === "personal" ? "Personal" : "Team"}</Badge>
                  <Badge>{roleLabel[activeWorkspace.role as keyof typeof roleLabel]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {roleDescription[activeWorkspace.role as keyof typeof roleDescription]}
                </p>
                {activeWorkspace.type === "team" ? (
                  <div className="mt-4">
                    <Link className={workspaceLinkClass(false)} href={`/workspaces/${activeWorkspace.id}/members`}>
                      进入成员管理
                    </Link>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>空间概览</CardTitle>
                <CardDescription>主体、场景、指令开始作为统一资源层承接画布生成上下文。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Subjects</p>
                  <p className="mt-2 text-2xl font-semibold">{subjects.length}</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Scenes</p>
                  <p className="mt-2 text-2xl font-semibold">{scenes.length}</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Instructions</p>
                  <p className="mt-2 text-2xl font-semibold">{instructionPresets.length}</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Canvases</p>
                  <p className="mt-2 text-2xl font-semibold">{canvases.length}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>快速开始</CardTitle>
                <CardDescription>先把主路径放出来，避免只有查看入口却没有创建入口。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Link className={workspaceLinkClass(true)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                  新建画布
                </Link>
                <Link className={workspaceLinkClass(false)} href={`/libraries?workspaceId=${activeWorkspace.id}`}>
                  管理资源库
                </Link>
                <Link className={workspaceLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                  查看任务
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>最近画布</CardTitle>
                <CardDescription>从工作台直接进入具体画布，查看节点运行、结果和失败重试。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {canvases.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                    当前空间还没有画布。
                  </div>
                ) : (
                  canvases.slice(0, 6).map((canvas) => (
                    <Link
                      key={canvas.id}
                      className="block rounded-2xl border bg-muted/20 p-4 transition hover:bg-muted/40"
                      href={`/canvases/${canvas.id}?workspaceId=${activeWorkspace.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{canvas.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {canvas.description?.trim() || "进入画布详情查看节点、边与运行历史。"}
                          </p>
                        </div>
                        <Badge variant="outline">{canvas.status}</Badge>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>最近任务</CardTitle>
                <CardDescription>展示当前 workspace 最近的任务、轮询与错误信息。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                    当前空间还没有任务记录。
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{task.taskType}</Badge>
                            <Badge>{task.status}</Badge>
                          </div>
                          <p className="font-medium">{task.nodeTitle ?? "未绑定节点"}</p>
                          <p className="text-sm text-muted-foreground">
                            {task.canvasName ?? "未绑定画布"} · retry {task.retryCount} · poll {task.pollCount}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <p>创建于 {formatDateTime(task.createdAt)}</p>
                          <p>下次轮询 {formatDateTime(task.nextPollAt)}</p>
                        </div>
                      </div>
                      {task.errorMessage ? (
                        <p className="mt-3 text-sm text-destructive">{task.errorCode ?? "ERROR"} · {task.errorMessage}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
