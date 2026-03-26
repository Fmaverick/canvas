import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listNodeRunBatches, listTasks } from "@/application/services/task-service";
import { Badge } from "@/components/ui/badge";

type TaskCenterPageProps = {
  searchParams?: Promise<{
    workspaceId?: string;
    status?: string;
    taskType?: string;
  }>;
};

const taskStatusOptions = [
  { label: "全部状态", value: undefined },
  { label: "排队中", value: "queued" },
  { label: "处理中", value: "processing" },
  { label: "已成功", value: "succeeded" },
  { label: "已失败", value: "failed" },
] as const;

const taskTypeOptions = [
  { label: "全部类型", value: undefined },
  { label: "文本", value: "text" },
  { label: "分镜", value: "storyboard" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
] as const;

const statusLabel = {
  queued: "排队中",
  processing: "处理中",
  succeeded: "已成功",
  failed: "已失败",
  canceled: "已取消",
} as const;

const typeLabel = {
  text: "文本",
  storyboard: "分镜",
  image: "图片",
  video: "视频",
  audio: "音频",
} as const;

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted";
}

function filterLinkClass(active: boolean) {
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
  if (status === "failed" || status === "partial_failed") {
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

function typeTone(taskType: string) {
  if (taskType === "video") {
    return "bg-[#f4f3ff] text-[#5b21b6]";
  }

  if (taskType === "image") {
    return "bg-[#fff7ed] text-[#c2410c]";
  }

  if (taskType === "storyboard") {
    return "bg-[#eef4ff] text-[#1d4ed8]";
  }

  if (taskType === "audio") {
    return "bg-[#f5f3ff] text-[#6d28d9]";
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

function getNextPollDisplay(value: Date | null, taskStatus: string, taskType: string) {
  if (!value) {
    return "—";
  }

  const formatted = formatDateTime(value);

  if (taskType === "video" && taskStatus === "processing" && value.getTime() <= Date.now()) {
    return `已到期 · ${formatted}`;
  }

  return formatted;
}

function buildHref(workspaceId: string | undefined, status: string | undefined, taskType: string | undefined) {
  const params = new URLSearchParams();

  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }

  if (status) {
    params.set("status", status);
  }

  if (taskType) {
    params.set("taskType", taskType);
  }

  const query = params.toString();

  return query ? `/tasks?${query}` : "/tasks";
}

function resolveOptionLabel(
  options: ReadonlyArray<{ label: string; value: string | undefined }>,
  value: string | undefined,
) {
  return options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "全部";
}

export default async function TaskCenterPage({ searchParams }: TaskCenterPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/tasks", {
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
            任务中心
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后查看任务中心</h1>
            <p className="text-base leading-7 text-muted-foreground">
              当前任务中心依赖会话态来解析当前用户，以及你可访问的 workspace 范围。
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
  const workspaces = currentUserResult.workspaces;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === resolvedSearchParams?.workspaceId) ??
    workspaces.find((workspace) => workspace.type === "personal") ??
    workspaces[0];
  const activeWorkspaceId = activeWorkspace?.id;
  const activeStatus =
    resolvedSearchParams?.status && ["queued", "processing", "succeeded", "failed", "canceled"].includes(resolvedSearchParams.status)
      ? resolvedSearchParams.status
      : undefined;
  const activeTaskType =
    resolvedSearchParams?.taskType && ["text", "image", "video", "audio", "storyboard"].includes(resolvedSearchParams.taskType)
      ? resolvedSearchParams.taskType
      : undefined;
  const tasks = activeWorkspaceId
    ? await listTasks({
        workspaceId: activeWorkspaceId,
        status: activeStatus as "queued" | "processing" | "succeeded" | "failed" | "canceled" | undefined,
        taskType: activeTaskType as "text" | "image" | "video" | "audio" | "storyboard" | undefined,
        limit: 100,
      })
    : [];
  const batchRuns = activeWorkspaceId
    ? await listNodeRunBatches({
        workspaceId: activeWorkspaceId,
        limit: 30,
      })
    : [];

  const metrics = {
    total: tasks.length,
    processing: tasks.filter((task) => task.status === "processing" || task.status === "queued").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    succeeded: tasks.filter((task) => task.status === "succeeded").length,
  };
  const activeStatusLabel = resolveOptionLabel(taskStatusOptions, activeStatus);
  const activeTaskTypeLabel = resolveOptionLabel(taskTypeOptions, activeTaskType);
  const overviewStats = [
    { label: "当前空间", value: activeWorkspace?.name ?? "未选择", accent: "bg-[#f7f7f8]" },
    { label: "当前角色", value: activeWorkspace?.role ?? "—", accent: "bg-[#f7f7f8]" },
    { label: "运行中任务", value: String(metrics.processing), accent: "bg-[#f5f7ff]" },
    { label: "成功 / 失败", value: `${metrics.succeeded} / ${metrics.failed}`, accent: "bg-[#f7f7f8]" },
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
                      Task Center
                    </span>
                    <span className="hidden sm:inline">{activeWorkspace?.name ?? "未选择空间"}</span>
                    {activeStatus ? (
                      <span className="hidden rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs sm:inline">
                        {activeStatusLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    集中查看节点运行、轮询与重试状态
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    只展示你当前可访问的 workspace 任务，把筛选、状态和关键错误收拢到同一视图。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeWorkspaceId ? (
                  <Link className={actionLinkClass(true)} href={`/tasks?workspaceId=${activeWorkspaceId}`}>
                    刷新当前空间
                  </Link>
                ) : null}
                <Link className={actionLinkClass(false)} href={activeWorkspaceId ? `/canvases?workspaceId=${activeWorkspaceId}` : "/canvases"}>
                  进入画布
                </Link>
                <Link
                  className={actionLinkClass(false)}
                  href={activeWorkspaceId ? `/dashboard?workspaceId=${activeWorkspaceId}` : "/dashboard"}
                >
                  返回工作台
                </Link>
                <Link className={actionLinkClass(false)} href="/">
                  返回首页
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-t border-black/5 bg-[#fafafb] p-5 sm:p-6 xl:border-r xl:border-t-0">
              <div className="space-y-4">
                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">筛选概览</p>
                    <p className="text-sm text-muted-foreground">任务范围始终限定在你当前可访问的 workspace 内。</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-xs text-muted-foreground">工作空间</p>
                      <p className="mt-2 font-medium text-foreground">{activeWorkspace?.name ?? "未选择"}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-xs text-muted-foreground">当前角色</p>
                      <p className="mt-2 font-medium text-foreground">{activeWorkspace?.role ?? "—"}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#fcfcfd] p-4">
                      <p className="text-xs text-muted-foreground">任务类型</p>
                      <p className="mt-2 font-medium text-foreground">{activeTaskTypeLabel}</p>
                    </div>
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">工作空间</p>
                    <p className="text-sm text-muted-foreground">这里只展示你当前账号可访问的空间，并保留原有筛选条件。</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {workspaces.map((workspace) => (
                      <Link
                        key={workspace.id}
                        className={filterLinkClass(workspace.id === activeWorkspaceId)}
                        href={buildHref(workspace.id, activeStatus, activeTaskType)}
                      >
                        {workspace.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">任务状态</p>
                    <p className="text-sm text-muted-foreground">按处理阶段收窄范围，优先定位重试与异常任务。</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {taskStatusOptions.map((option) => (
                      <Link
                        key={option.label}
                        className={filterLinkClass(option.value === activeStatus)}
                        href={buildHref(activeWorkspaceId, option.value, activeTaskType)}
                      >
                        {option.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">任务类型</p>
                    <p className="text-sm text-muted-foreground">文本、分镜、图片、视频沿用统一浏览节奏，切换时不打断排查流程。</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {taskTypeOptions.map((option) => (
                      <Link
                        key={option.label}
                        className={filterLinkClass(option.value === activeTaskType)}
                        href={buildHref(activeWorkspaceId, activeStatus, option.value)}
                      >
                        {option.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className={surfaceClassName(true)}>
                  <p className="text-sm font-medium text-foreground">浏览建议</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    先确认当前 workspace，再聚焦失败任务、轮询到期任务和 provider 错误。
                  </p>
                </div>
              </div>
            </aside>

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

              <div className="px-5 py-5 sm:px-6">
                <div className={surfaceClassName()}>
                  <div className="flex flex-col gap-3 border-b border-black/5 pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">批量运行记录</p>
                        <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                          {batchRuns.length}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">查看单节点批量运行和多节点成组运行，并直接下载每轮结果归档。</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {batchRuns.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-8 text-sm text-muted-foreground">
                        当前空间还没有批量运行记录。
                      </div>
                    ) : (
                      batchRuns.map((batchRun) => (
                        <div key={batchRun.id} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4 sm:p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(batchRun.status)}`}>
                                  {batchRun.status === "partial_failed" ? "部分失败" : statusLabel[batchRun.status as keyof typeof statusLabel] ?? batchRun.status}
                                </span>
                                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs text-muted-foreground">
                                  {batchRun.mode === "single_node" ? "单节点批量" : "多节点成组"}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <h3 className="font-medium text-foreground">
                                  {Array.isArray(batchRun.selectedNodesJson) && batchRun.selectedNodesJson.length > 0
                                    ? batchRun.selectedNodesJson
                                        .map((node) =>
                                          node && typeof node === "object" && "title" in node && typeof node.title === "string" ? node.title : "",
                                        )
                                        .filter(Boolean)
                                        .slice(0, 4)
                                        .join("、")
                                    : "未命名节点组"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  运行次数 {batchRun.requestedRunCount} · 节点执行 {batchRun.completedNodeRunCount} / {batchRun.totalNodeRunCount}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                className={actionLinkClass(true)}
                                href={`/api/tasks/batch-runs/${batchRun.id}/download?workspaceId=${activeWorkspaceId}`}
                              >
                                批量下载
                              </Link>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                              <p className="text-xs text-muted-foreground">批量 ID</p>
                              <p className="mt-2 truncate font-medium text-foreground">{batchRun.id}</p>
                            </div>
                            <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                              <p className="text-xs text-muted-foreground">成功 / 失败</p>
                              <p className="mt-2 font-medium text-foreground">
                                {batchRun.succeededNodeRunCount} / {batchRun.failedNodeRunCount}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                              <p className="text-xs text-muted-foreground">创建于</p>
                              <p className="mt-2 font-medium text-foreground">{formatDateTime(batchRun.createdAt)}</p>
                            </div>
                            <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                              <p className="text-xs text-muted-foreground">更新于</p>
                              <p className="mt-2 font-medium text-foreground">{formatDateTime(batchRun.updatedAt)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">任务列表</p>
                        <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                          {metrics.total}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">展示 provider、轮询、重试、错误与节点归属信息。</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-[#f5f7ff] px-2.5 py-1">运行中 {metrics.processing}</span>
                      <span className="rounded-full bg-[#f2f8f3] px-2.5 py-1">成功 {metrics.succeeded}</span>
                      <span className="rounded-full bg-[#fff1f1] px-2.5 py-1">失败 {metrics.failed}</span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {tasks.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-[#fcfcfd] px-5 py-8 text-sm text-muted-foreground">
                        当前筛选条件下没有任务记录。
                      </div>
                    ) : (
                      tasks.map((task) => {
                        const taskStatus = task.status as keyof typeof statusLabel;
                        const taskType = task.taskType as keyof typeof typeLabel;

                        return (
                          <div key={task.id} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4 sm:p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(task.status)}`}>
                                    {statusLabel[taskStatus]}
                                  </span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs ${typeTone(task.taskType)}`}>
                                    {typeLabel[taskType]}
                                  </span>
                                  <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs text-muted-foreground">
                                    {task.provider}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <h3 className="truncate font-medium text-foreground">{task.nodeTitle ?? "未绑定节点"}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {task.canvasName ?? "未绑定画布"} · {task.model}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0 space-y-1 text-xs text-muted-foreground">
                                <p>创建于 {formatDateTime(task.createdAt)}</p>
                                <p>更新于 {formatDateTime(task.updatedAt)}</p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">任务 ID</p>
                                <p className="mt-2 truncate font-medium text-foreground">{task.id}</p>
                              </div>
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">Provider Task</p>
                                <p className="mt-2 truncate font-medium text-foreground">{task.providerTaskId ?? "—"}</p>
                              </div>
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">重试 / 轮询</p>
                                <p className="mt-2 font-medium text-foreground">
                                  {task.retryCount} / {task.pollCount}
                                </p>
                              </div>
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">下次轮询</p>
                                <p className="mt-2 font-medium text-foreground">
                                  {getNextPollDisplay(task.nextPollAt, task.status, task.taskType)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">Request ID</p>
                                <p className="mt-2 truncate font-medium text-foreground">{task.requestId}</p>
                              </div>
                              <div className="rounded-[18px] border border-black/5 bg-white px-3 py-3">
                                <p className="text-xs text-muted-foreground">错误信息</p>
                                <p className={`mt-2 font-medium ${task.errorMessage ? "text-[#b42318]" : "text-foreground"}`}>
                                  {task.errorMessage ? `${task.errorCode ?? "ERROR"} · ${task.errorMessage}` : "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
