import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { listTasks } from "@/application/services/task-service";
import { CreateTeamWorkspacePanel } from "@/components/workspace/create-team-workspace-panel";
import { Badge } from "@/components/ui/badge";

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

function actionLinkClass(active: boolean) {
  return active
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

function statusTone(status: string) {
  if (status === "failed") {
    return "bg-[#fff1f1] text-[#b42318]";
  }

  if (status === "processing" || status === "queued") {
    return "bg-[#f5f7ff] text-[#344054]";
  }

  if (status === "succeeded") {
    return "bg-[#f2f8f3] text-[#166534]";
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
      <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col items-center justify-center gap-6 rounded-[28px] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <Badge variant="outline" className="border-black/8 bg-[#fcfcfd] text-foreground">
            工作台
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后再进入工作台</h1>
            <p className="text-base leading-7 text-muted-foreground">
              当前工作台依赖会话态来解析当前用户、默认 workspace 和角色权限。
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
  const workspaceCount = currentUserResult.workspaces.length;
  const resourceCount = subjects.length + scenes.length + instructionPresets.length;
  const recentCanvases = canvases.slice(0, 5);
  const isTeamWorkspace = activeWorkspace.type === "team";
  const canManageMembers = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const sharingDescription = isTeamWorkspace
    ? canManageMembers
      ? "从成员管理邀请账号后，对方切到这个 team workspace，就会看到同一套主体、场景和指令资源。"
      : "当前资源库已经共享在 team workspace 内。你可以直接使用共享资源，但成员邀请需要 owner 或 admin 操作。"
    : "当前是 personal workspace，资源默认只对你自己可见。若要共享资源库，需要先进入 team workspace。";

  const overviewStats = [
    { label: "当前空间", value: activeWorkspace.name, accent: "bg-[#f7f7f8]" },
    {
      label: "当前角色",
      value: roleLabel[activeWorkspace.role as keyof typeof roleLabel],
      accent: "bg-[#f7f7f8]",
    },
    { label: "处理中任务", value: String(runningTaskCount), accent: "bg-[#f5f7ff]" },
    { label: "成功 / 失败", value: `${succeededTaskCount} / ${failedTaskCount}`, accent: "bg-[#f7f7f8]" },
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
                      Dashboard
                    </span>
                    <span className="hidden sm:inline">{activeWorkspace.name}</span>
                    <span className="hidden rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs sm:inline">
                      {roleLabel[activeWorkspace.role as keyof typeof roleLabel]}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    欢迎回来，{currentUserResult.user.name ?? currentUserResult.user.email}
                  </h1>
                  <p className="text-sm text-muted-foreground">轻量总览、快速切换、直接进入画布与任务。</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link className={actionLinkClass(true)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                  进入画布
                </Link>
                <Link className={actionLinkClass(false)} href={`/libraries?workspaceId=${activeWorkspace.id}`}>
                  资源库
                </Link>
                <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                  任务中心
                </Link>
                {isTeamWorkspace ? (
                  <Link className={actionLinkClass(false)} href={`/workspaces/${activeWorkspace.id}/members`}>
                    成员与共享
                  </Link>
                ) : null}
                <Link className={actionLinkClass(false)} href="/">
                  返回首页
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_380px]">
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

              <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">最近画布</p>
                      <p className="text-sm text-muted-foreground">保留最常用入口，不堆叠过多信息。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {canvases.length}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {recentCanvases.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-6 text-sm text-muted-foreground">
                        当前空间还没有画布。
                      </div>
                    ) : (
                      recentCanvases.map((canvas) => (
                        <Link
                          key={canvas.id}
                          className="block rounded-[20px] border border-black/5 bg-[#fcfcfd] px-4 py-4 transition hover:border-black/10 hover:bg-white"
                          href={`/canvases/${canvas.id}?workspaceId=${activeWorkspace.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate font-medium text-foreground">{canvas.name}</p>
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {canvas.description?.trim() || "进入画布详情查看节点、边与运行历史。"}
                              </p>
                            </div>
                            <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs text-muted-foreground">
                              {canvas.status}
                            </span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">最近任务</p>
                      <p className="text-sm text-muted-foreground">只展示核心状态、节点与时间。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {tasks.length}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {tasks.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-6 text-sm text-muted-foreground">
                        当前空间还没有任务记录。
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <div key={task.id} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs text-muted-foreground">
                                  {task.taskType}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(task.status)}`}>
                                  {task.status}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{task.nodeTitle ?? "未绑定节点"}</p>
                                <p className="text-sm text-muted-foreground">
                                  {task.canvasName ?? "未绑定画布"} · retry {task.retryCount} · poll {task.pollCount}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 space-y-1 text-xs text-muted-foreground">
                              <p>创建于 {formatDateTime(task.createdAt)}</p>
                              <p>下次轮询 {formatDateTime(task.nextPollAt)}</p>
                            </div>
                          </div>

                          {task.errorMessage ? (
                            <p className="mt-3 text-sm text-[#b42318]">
                              {task.errorCode ?? "ERROR"} · {task.errorMessage}
                            </p>
                          ) : null}
                        </div>
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
                    <p className="text-sm text-muted-foreground">workspace 与权限基于当前会话解析。</p>
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
                      <p className="text-sm text-muted-foreground">保留最轻量的 workspace 入口。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {workspaceCount}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
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

                  <div className="mt-4">
                    <CreateTeamWorkspacePanel compact />
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
                    <div className="mt-4 rounded-[18px] border border-black/5 bg-white px-4 py-3">
                      <p className="text-sm font-medium text-foreground">共享资源库</p>
                      <p className="mt-1 text-sm text-muted-foreground">{sharingDescription}</p>
                    </div>
                    {isTeamWorkspace ? (
                      <div className="mt-4">
                        <Link className={actionLinkClass(false)} href={`/workspaces/${activeWorkspace.id}/members`}>
                          {canManageMembers ? "去邀请成员" : "查看成员与权限"}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">资源概览</p>
                      <p className="text-sm text-muted-foreground">延续 resources 页面相同的浅色信息密度。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {resourceCount}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-sm text-muted-foreground">Subjects</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{subjects.length}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-sm text-muted-foreground">Scenes</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{scenes.length}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-sm text-muted-foreground">Instructions</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {instructionPresets.length}
                      </p>
                    </div>
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-sm text-muted-foreground">Canvases</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{canvases.length}</p>
                    </div>
                  </div>
                </div>

                <div className={surfaceClassName(true)}>
                  <div className="flex flex-wrap gap-2">
                    <Link className={actionLinkClass(true)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                      新建画布
                    </Link>
                    <Link className={actionLinkClass(false)} href={`/libraries?workspaceId=${activeWorkspace.id}`}>
                      管理资源库
                    </Link>
                    <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                      查看任务
                    </Link>
                    {isTeamWorkspace ? (
                      <Link className={actionLinkClass(false)} href={`/workspaces/${activeWorkspace.id}/members`}>
                        成员与共享
                      </Link>
                    ) : null}
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
