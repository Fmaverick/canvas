import Link from "next/link";

import { listTasks } from "@/application/services/task-service";
import { listWorkspaces } from "@/application/services/workspace-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
] as const;

const statusBadgeVariant = {
  queued: "outline",
  processing: "secondary",
  succeeded: "default",
  failed: "destructive",
  canceled: "ghost",
} as const;

const statusLabel = {
  queued: "排队中",
  processing: "处理中",
  succeeded: "已成功",
  failed: "已失败",
  canceled: "已取消",
} as const;

const typeLabel = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
} as const;

function linkButtonClass(active: boolean) {
  return active
    ? "inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
    : "inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted";
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

export default async function TaskCenterPage({ searchParams }: TaskCenterPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const workspaces = await listWorkspaces({});
  const activeWorkspaceId = resolvedSearchParams?.workspaceId ?? workspaces[0]?.id;
  const activeStatus =
    resolvedSearchParams?.status && ["queued", "processing", "succeeded", "failed", "canceled"].includes(resolvedSearchParams.status)
      ? resolvedSearchParams.status
      : undefined;
  const activeTaskType =
    resolvedSearchParams?.taskType && ["text", "image", "video", "audio"].includes(resolvedSearchParams.taskType)
      ? resolvedSearchParams.taskType
      : undefined;
  const tasks = activeWorkspaceId
    ? await listTasks({
        workspaceId: activeWorkspaceId,
        status: activeStatus as "queued" | "processing" | "succeeded" | "failed" | "canceled" | undefined,
        taskType: activeTaskType as "text" | "image" | "video" | "audio" | undefined,
        limit: 100,
      })
    : [];

  const metrics = {
    total: tasks.length,
    processing: tasks.filter((task) => task.status === "processing").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    succeeded: tasks.filter((task) => task.status === "succeeded").length,
  };

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge>任务中心</Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">集中查看节点运行、轮询与重试状态</h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  当前页面聚焦 generation_tasks 主链路，统一查看文本、图片、视频任务的状态、错误、轮询计划和重试次数。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className={linkButtonClass(false)} href="/">
                返回首页
              </Link>
              {activeWorkspaceId ? (
                <Link className={linkButtonClass(true)} href={`/tasks?workspaceId=${activeWorkspaceId}`}>
                  刷新当前空间
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>当前空间任务数</CardDescription>
              <CardTitle className="text-2xl">{metrics.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>处理中</CardDescription>
              <CardTitle className="text-2xl">{metrics.processing}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>已成功</CardDescription>
              <CardTitle className="text-2xl">{metrics.succeeded}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>已失败</CardDescription>
              <CardTitle className="text-2xl">{metrics.failed}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>筛选</CardTitle>
              <CardDescription>先选 workspace，再按状态或类型筛任务。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">工作空间</p>
                <div className="flex flex-wrap gap-2">
                  {workspaces.map((workspace) => (
                    <Link
                      key={workspace.id}
                      className={linkButtonClass(workspace.id === activeWorkspaceId)}
                      href={buildHref(workspace.id, activeStatus, activeTaskType)}
                    >
                      {workspace.name}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">任务状态</p>
                <div className="flex flex-wrap gap-2">
                  {taskStatusOptions.map((option) => (
                    <Link
                      key={option.label}
                      className={linkButtonClass(option.value === activeStatus)}
                      href={buildHref(activeWorkspaceId, option.value, activeTaskType)}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">任务类型</p>
                <div className="flex flex-wrap gap-2">
                  {taskTypeOptions.map((option) => (
                    <Link
                      key={option.label}
                      className={linkButtonClass(option.value === activeTaskType)}
                      href={buildHref(activeWorkspaceId, activeStatus, option.value)}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>任务列表</CardTitle>
              <CardDescription>展示 provider、轮询、重试、错误与节点归属信息。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-sm text-muted-foreground">
                  当前筛选条件下没有任务记录。
                </div>
              ) : (
                tasks.map((task) => {
                  const taskStatus = task.status as keyof typeof statusBadgeVariant;
                  const taskType = task.taskType as keyof typeof typeLabel;

                  return (
                    <div key={task.id} className="rounded-2xl border bg-muted/20 p-4">
                      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusBadgeVariant[taskStatus]}>{statusLabel[taskStatus]}</Badge>
                            <Badge variant="outline">{typeLabel[taskType]}</Badge>
                            <Badge variant="ghost">{task.provider}</Badge>
                          </div>
                          <div>
                            <h3 className="font-medium">{task.nodeTitle ?? "未绑定节点"}</h3>
                            <p className="text-sm text-muted-foreground">
                              {task.canvasName ?? "未绑定画布"} · {task.model}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <p>创建于 {formatDateTime(task.createdAt)}</p>
                          <p>更新于 {formatDateTime(task.updatedAt)}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">任务 ID</p>
                          <p className="truncate font-medium">{task.id}</p>
                        </div>
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Provider Task</p>
                          <p className="truncate font-medium">{task.providerTaskId ?? "—"}</p>
                        </div>
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">重试 / 轮询</p>
                          <p className="font-medium">
                            {task.retryCount} / {task.pollCount}
                          </p>
                        </div>
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">下次轮询</p>
                          <p className="font-medium">{getNextPollDisplay(task.nextPollAt, task.status, task.taskType)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Request ID</p>
                          <p className="truncate font-medium">{task.requestId}</p>
                        </div>
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">错误信息</p>
                          <p className="font-medium text-destructive/90">
                            {task.errorMessage ? `${task.errorCode ?? "ERROR"} · ${task.errorMessage}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
