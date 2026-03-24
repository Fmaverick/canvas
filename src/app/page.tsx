import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { listProducts } from "@/application/services/product-service";
import { listTasks } from "@/application/services/task-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CoreModule,
  ExecutionStep,
  Guardrail,
  Milestone,
  ModuleStage,
  OverviewMetric,
} from "@/domain/models/platform";
import { ArrowRight, Boxes, FolderKanban, ShieldCheck, Sparkles, Workflow } from "lucide-react";

const overviewMetrics: OverviewMetric[] = [
  {
    label: "鉴权状态",
    value: "Session 已接通",
    detail: "注册、登录、me、登出与数据库会话已经可用。",
  },
  {
    label: "空间协作",
    value: "个人 + 团队",
    detail: "personal / team workspace、成员角色与资源权限已经落地。",
  },
  {
    label: "任务系统",
    value: "运行 + 重试 + 轮询",
    detail: "任务中心、单任务重试与批量轮询入口都已完成。",
  },
  {
    label: "业务前端",
    value: "工作台已上线",
    detail: "登录页、注册页、工作台与 workspace 切换已经接到真实数据。",
  },
];

const coreModules: CoreModule[] = [
  {
    name: "Auth / Workspace",
    stage: "foundation",
    description: "用户系统已经从开发占位切到正式 session 模式，并开始驱动主业务接口。",
    highlights: ["注册后自动创建个人空间", "团队成员角色分级已生效", "业务接口开始按角色做权限控制"],
  },
  {
    name: "Product / Model Profile",
    stage: "core",
    description: "产品库已具备基础 CRUD，并已接到 workspace 与 session 权限体系。",
    highlights: ["支持按 workspace 管理", "标签与分类可用", "viewer 只读、editor 可编辑"],
  },
  {
    name: "Canvas / Node Runtime",
    stage: "core",
    description: "画布、节点、边与运行入口已可用，当前阶段重点从接口转向页面承接。",
    highlights: ["图结构防环已实现", "节点运行接任务系统", "角色控制已接到编辑与运行接口"],
  },
  {
    name: "AI Gateway / Adapter Registry",
    stage: "runtime",
    description: "供应商接入已覆盖文本、图片和视频三条主链，音频暂缓。",
    highlights: ["文本已真实跑通", "图片已真实跑通", "视频已支持提交、轮询与重试"],
  },
  {
    name: "Task / Polling / Result",
    stage: "runtime",
    description: "任务系统已经具备真正的产品化骨架，后续重点是 UI 承接与自动调度。",
    highlights: ["request_id 幂等", "支持失败重试", "媒体任务可追踪可查询"],
  },
  {
    name: "Admin / Audit",
    stage: "operations",
    description: "后台和审计还没正式开工，目前先保证主业务与多用户协作跑通。",
    highlights: ["Admin 仍待建设", "审计日志待建设", "当前优先前端业务承接"],
  },
];

const executionSteps: ExecutionStep[] = [
  {
    title: "1. 登录进入当前空间",
    description: "用户通过 session 登录后进入 personal 或 team workspace，页面不再依赖开发期 header 假设。",
  },
  {
    title: "2. 发起节点运行",
    description: "editor、admin、owner 可运行节点，viewer 仅可查看当前空间资源与任务状态。",
  },
  {
    title: "3. 进入任务系统",
    description: "任务被创建后进入 provider 调度、状态轮询、失败重试和结果回写链路。",
  },
  {
    title: "4. 在工作台承接结果",
    description: "工作台和任务中心展示当前 workspace 的任务、角色、轮询与错误状态。",
  },
];

const milestones: Milestone[] = [
  {
    phase: "Phase 0",
    title: "文档统一与平台化重构",
    status: "ready",
    items: ["完成 PRD、架构、数据库、API、节点协议对齐", "确认禁止继续把 Dexie 当主业务存储"],
  },
  {
    phase: "Phase 1",
    title: "服务端主骨架",
    status: "ready",
    items: ["接通 Drizzle schema 与核心业务表", "补齐 Auth / Workspace / Product / Canvas / Task API"],
  },
  {
    phase: "Phase 2",
    title: "AI 运行时与任务系统",
    status: "ready",
    items: ["文本、图片、视频主链已接通", "任务重试、单任务轮询、批量轮询已完成"],
  },
  {
    phase: "Phase 3",
    title: "前端业务承接",
    status: "building",
    items: ["登录页、注册页、工作台已完成", "下一步继续承接任务中心、画布与成员管理页面"],
  },
];

const guardrails: Guardrail[] = [
  {
    label: "ORM 约束",
    detail: "正式业务使用 Drizzle ORM + drizzle-kit，不使用 Prisma。",
  },
  {
    label: "存储约束",
    detail: "Dexie 最多保留为草稿或缓存，正式业务数据迁移到服务端数据库。",
  },
  {
    label: "画布约束",
    detail: "节点协议以前后端统一契约为准，复制节点默认不复制边。",
  },
  {
    label: "任务约束",
    detail: "视频与异步音频统一复用任务系统、轮询机制和状态查询接口。",
  },
  {
    label: "权限约束",
    detail: "viewer 只读，editor/admin/owner 才能编辑资源与发起生成。",
  },
];

const moduleStageLabel: Record<ModuleStage, string> = {
  foundation: "基础层",
  core: "核心业务",
  runtime: "运行时",
  operations: "运营后台",
};

const milestoneTone = {
  ready: "default",
  building: "secondary",
  planned: "outline",
} as const;

const milestoneLabel = {
  ready: "已就绪",
  building: "进行中",
  planned: "已规划",
} as const;

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

export default async function Home() {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/", {
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

  if (currentUserResult) {
    const activeWorkspace =
      currentUserResult.workspaces.find((workspace) => workspace.type === "personal") ??
      currentUserResult.workspaces[0];
    const [tasks, canvases, products] = await Promise.all([
      listTasks({ workspaceId: activeWorkspace.id, limit: 6 }),
      listCanvases({ workspaceId: activeWorkspace.id }),
      listProducts({ workspaceId: activeWorkspace.id }),
    ]);
    const runningTaskCount = tasks.filter((task) => task.status === "processing" || task.status === "queued").length;
    const failedTaskCount = tasks.filter((task) => task.status === "failed").length;

    return (
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
          <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <Badge>业务首页</Badge>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    欢迎回来，{currentUserResult.user.name ?? currentUserResult.user.email}
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                    首页已切换为登录态业务入口。你现在看到的是当前 workspace 的摘要，而不是静态介绍页。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link className={workspaceLinkClass(true)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                  进入工作台
                </Link>
                <Link className={workspaceLinkClass(false)} href={`/tasks?workspaceId=${activeWorkspace.id}`}>
                  查看任务中心
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
                <CardDescription>失败任务</CardDescription>
                <CardTitle className="text-2xl">{failedTaskCount}</CardTitle>
              </CardHeader>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
            <Card>
              <CardHeader>
                <CardTitle>当前空间上下文</CardTitle>
                <CardDescription>从首页直接感知当前 workspace、角色与可访问空间。</CardDescription>
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
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>业务概览</CardTitle>
                  <CardDescription>首页直接展示当前 workspace 的核心资源体量。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Products</p>
                    <p className="mt-2 text-2xl font-semibold">{products.length}</p>
                  </div>
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Canvases</p>
                    <p className="mt-2 text-2xl font-semibold">{canvases.length}</p>
                  </div>
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Tasks</p>
                    <p className="mt-2 text-2xl font-semibold">{tasks.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>最近任务</CardTitle>
                  <CardDescription>不跳转工作台，也能先在首页看当前任务状态。</CardDescription>
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
                          <p className="mt-3 text-sm text-destructive">
                            {task.errorCode ?? "ERROR"} · {task.errorMessage}
                          </p>
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

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge>AI 内容生产平台</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  已从后端骨架阶段，进入前端业务承接阶段
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  当前项目已经具备正式用户系统、workspace 协作、角色权限、任务中心与 AI 运行主链，
                  首页现在更适合作为产品总览与工作台入口，而不是单纯的重构说明页。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
                  href="/dashboard"
                >
                  进入工作台
                </Link>
                <Link
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted"
                  href="/tasks"
                >
                  查看任务中心
                </Link>
              </div>
            </div>
            <Card className="w-full max-w-xl border-dashed bg-muted/40">
              <CardHeader>
                <CardTitle>当前产品状态</CardTitle>
                <CardDescription>首页反映的是当前真实开发进度，而不是最初的迁移计划。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between rounded-xl border bg-background px-4 py-3">
                  <span>当前主入口</span>
                  <span className="font-medium text-foreground">Dashboard / Tasks</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background px-4 py-3">
                  <span>已可用节点</span>
                  <span className="font-medium text-foreground">text / image / video</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background px-4 py-3">
                  <span>权限模型</span>
                  <span className="font-medium text-foreground">owner / admin / editor / viewer</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background px-4 py-3">
                  <span>当前重心</span>
                  <span className="font-medium text-foreground">前端业务承接</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewMetrics.map((metric) => (
            <Card key={metric.label} size="sm">
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-lg">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {metric.detail}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>核心模块蓝图</CardTitle>
              <CardDescription>这里展示的不是空规划，而是当前已经搭好的模块与接下来的前端承接重点。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {coreModules.map((module) => (
                <div key={module.name} className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-foreground">
                      {module.stage === "foundation" && <ShieldCheck className="size-4" />}
                      {module.stage === "core" && <Boxes className="size-4" />}
                      {module.stage === "runtime" && <Workflow className="size-4" />}
                      {module.stage === "operations" && <FolderKanban className="size-4" />}
                      <h3 className="font-medium">{module.name}</h3>
                    </div>
                    <Badge variant="outline">{moduleStageLabel[module.stage]}</Badge>
                  </div>
                  <p className="mb-3 text-sm leading-6 text-muted-foreground">{module.description}</p>
                  <ul className="space-y-2 text-sm text-foreground/90">
                    {module.highlights.map((highlight) => (
                      <li key={highlight} className="flex items-start gap-2">
                        <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>当前主链路</CardTitle>
              <CardDescription>现在的产品闭环已经从登录、空间、节点运行延伸到了任务展示和权限控制。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {executionSteps.map((step, index) => (
                <div key={step.title} className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {index + 1}
                    </div>
                    <h3 className="font-medium">{step.title}</h3>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>实现硬约束</CardTitle>
              <CardDescription>这些约束会继续约束后面的前端页面和协作能力，不会因为 UI 开工而失效。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {guardrails.map((guardrail) => (
                <div key={guardrail.label} className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Sparkles className="size-4 text-muted-foreground" />
                    <h3 className="font-medium">{guardrail.label}</h3>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{guardrail.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>实施阶段</CardTitle>
              <CardDescription>阶段状态已经按当前代码库真实进度更新。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {milestones.map((milestone) => (
                <div key={milestone.phase} className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        {milestone.phase}
                      </p>
                      <h3 className="font-medium">{milestone.title}</h3>
                    </div>
                    <Badge variant={milestoneTone[milestone.status]}>
                      {milestoneLabel[milestone.status]}
                    </Badge>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {milestone.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <ArrowRight className="mt-1 size-3.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
