import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listCanvases } from "@/application/services/canvas-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { listTasks } from "@/application/services/task-service";
import { CreateTeamWorkspacePanel } from "@/components/workspace/create-team-workspace-panel";
import { Badge } from "@/components/ui/badge";
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
    name: "Subject / Scene / Instruction",
    stage: "core",
    description: "主体库、场景库与指令库开始收敛为统一资源层，承接文生图与图生图的上下文输入。",
    highlights: ["主体与场景复用同一底层结构", "指令库支持预制 prompt 沉淀", "viewer 只读、editor 可编辑"],
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
    items: ["接通 Drizzle schema 与核心业务表", "补齐 Auth / Workspace / Library / Canvas / Task API"],
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
    ? "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted";
}

function workspaceChipClass(active: boolean) {
  return active
    ? "inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-[0_8px_24px_-24px_rgba(15,23,42,0.24)]"
    : "inline-flex items-center rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition hover:border-black/8 hover:bg-white";
}

function surfaceClassName(compact = false) {
  return compact
    ? "rounded-[20px] border border-black/5 bg-white p-4"
    : "rounded-[24px] border border-black/5 bg-white p-5 sm:p-6";
}

function taskStatusTone(status: string) {
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

function taskTypeTone(taskType: string) {
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
    const [tasks, canvases, subjects, scenes, instructionPresets] = await Promise.all([
      listTasks({ workspaceId: activeWorkspace.id, limit: 6 }),
      listCanvases({ workspaceId: activeWorkspace.id }),
      listLibraryItems({ workspaceId: activeWorkspace.id, kind: "subject" }),
      listLibraryItems({ workspaceId: activeWorkspace.id, kind: "scene" }),
      listInstructionPresets({ workspaceId: activeWorkspace.id, userId: currentUserResult.user.id }),
    ]);
    const runningTaskCount = tasks.filter((task) => task.status === "processing" || task.status === "queued").length;
    const failedTaskCount = tasks.filter((task) => task.status === "failed").length;
    const succeededTaskCount = tasks.filter((task) => task.status === "succeeded").length;
    const overviewStats = [
      { label: "当前空间", value: activeWorkspace.name, accent: "bg-[#f7f7f8]" },
      {
        label: "当前角色",
        value: roleLabel[activeWorkspace.role as keyof typeof roleLabel],
        accent: "bg-[#f7f7f8]",
      },
      { label: "运行中任务", value: String(runningTaskCount), accent: "bg-[#f5f7ff]" },
      { label: "成功 / 失败", value: `${succeededTaskCount} / ${failedTaskCount}`, accent: "bg-[#f7f7f8]" },
    ];
    const resourceSummary = [
      { label: "Subjects", value: String(subjects.length) },
      { label: "Scenes", value: String(scenes.length) },
      { label: "Instructions", value: String(instructionPresets.length) },
      { label: "Canvases", value: String(canvases.length) },
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
                        Home
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
                    <p className="text-sm text-muted-foreground">
                      首页现在直接承接当前 workspace 的资源、任务与入口，而不是停留在静态介绍页。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className={workspaceLinkClass(true)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                    进入工作台
                  </Link>
                  <Link className={workspaceLinkClass(false)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                    进入画布
                  </Link>
                  <Link className={workspaceLinkClass(false)} href={`/libraries?workspaceId=${activeWorkspace.id}`}>
                    进入资源库
                  </Link>
                  <Link className={workspaceLinkClass(false)} href={`/workflow-templates?workspaceId=${activeWorkspace.id}`}>
                    封装工作流
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

                <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className={surfaceClassName()}>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">当前空间上下文</p>
                      <p className="text-sm text-muted-foreground">首页直接感知当前用户、workspace 与角色权限。</p>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                        <p className="font-medium text-foreground">{currentUserResult.user.name ?? "未命名用户"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{currentUserResult.user.email}</p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-foreground">可访问空间</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {currentUserResult.workspaces.map((workspace) => (
                            <Link
                              key={workspace.id}
                              className={workspaceChipClass(workspace.id === activeWorkspace.id)}
                              href={`/dashboard?workspaceId=${workspace.id}`}
                            >
                              {workspace.name}
                            </Link>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[20px] bg-[#fcfcfd] p-4">
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

                      <div>
                        <CreateTeamWorkspacePanel compact />
                      </div>
                    </div>
                  </div>

                  <div className={surfaceClassName()}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">业务概览</p>
                        <p className="text-sm text-muted-foreground">当前 workspace 的资源和画布规模一屏看清。</p>
                      </div>
                      <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                        {resourceSummary.length}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {resourceSummary.map((item) => (
                        <div key={item.label} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                          <p className="text-sm text-muted-foreground">{item.label}</p>
                          <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-[20px] bg-[#fcfcfd] p-4">
                      <p className="text-sm font-medium text-foreground">当前节奏</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        从首页进入工作台、画布和任务中心，保持和当前 workspace 一致的上下文连续性。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-black/5 px-5 py-5 sm:px-6">
                  <div className={surfaceClassName()}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">最近任务</p>
                        <p className="text-sm text-muted-foreground">不离开首页，也能先判断当前任务健康度。</p>
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
                                  <span className={`rounded-full px-2.5 py-1 text-xs ${taskTypeTone(task.taskType)}`}>
                                    {task.taskType}
                                  </span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs ${taskStatusTone(task.status)}`}>
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
                      <p className="text-sm font-medium text-foreground">快速入口</p>
                      <p className="text-sm text-muted-foreground">首页保持轻量导航，不挤压主要业务内容。</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link className={workspaceLinkClass(true)} href={`/dashboard?workspaceId=${activeWorkspace.id}`}>
                        工作台
                      </Link>
                      <Link className={workspaceLinkClass(false)} href={`/canvases?workspaceId=${activeWorkspace.id}`}>
                        画布
                      </Link>
                      <Link className={workspaceLinkClass(false)} href={`/workflow-templates?workspaceId=${activeWorkspace.id}`}>
                        封装工作流
                      </Link>
                    </div>
                  </div>

                  <div className={surfaceClassName()}>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">当前重点</p>
                      <p className="text-sm text-muted-foreground">首页不再解释历史重构，而是直接服务于当下使用路径。</p>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                        <p className="text-xs text-muted-foreground">资源浏览</p>
                        <p className="mt-2 text-sm text-foreground">进入资源库维护主体、场景和指令素材。</p>
                      </div>
                      <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                        <p className="text-xs text-muted-foreground">画布推进</p>
                        <p className="mt-2 text-sm text-foreground">在画布里继续配置节点、边和运行链路。</p>
                      </div>
                      <div className="rounded-[20px] bg-[#fcfcfd] p-4">
                        <p className="text-xs text-muted-foreground">任务排查</p>
                        <p className="mt-2 text-sm text-foreground">优先关注运行中、失败和轮询到期任务。</p>
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
                      Home
                    </span>
                    <span className="hidden sm:inline">AI 内容生产平台</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    已从后端骨架阶段，进入前端业务承接阶段
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    首页现在更像真正的产品入口：先给你清楚的现状，再直接把你送进工作台与任务链路。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link className={workspaceLinkClass(true)} href="/dashboard">
                  进入工作台
                </Link>
                <Link className={workspaceLinkClass(false)} href="/tasks">
                  查看任务中心
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <section className="min-w-0 bg-white">
              <div className="border-b border-black/5 px-5 py-5 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {overviewMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                      <div className="inline-flex rounded-full bg-[#f7f7f8] px-2 py-1 text-xs text-muted-foreground">
                        {metric.label}
                      </div>
                      <p className="mt-4 text-lg font-semibold tracking-tight text-foreground">{metric.value}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">核心模块蓝图</p>
                      <p className="text-sm text-muted-foreground">展示当前已经落地的模块，以及接下来的前端承接重点。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {coreModules.length}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {coreModules.map((module) => (
                      <div key={module.name} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-foreground">
                            {module.stage === "foundation" && <ShieldCheck className="size-4" />}
                            {module.stage === "core" && <Boxes className="size-4" />}
                            {module.stage === "runtime" && <Workflow className="size-4" />}
                            {module.stage === "operations" && <FolderKanban className="size-4" />}
                            <h3 className="font-medium">{module.name}</h3>
                          </div>
                          <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                            {moduleStageLabel[module.stage]}
                          </Badge>
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
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">当前主链路</p>
                    <p className="text-sm text-muted-foreground">登录、空间、节点运行、任务展示与权限控制已经串起来。</p>
                  </div>

                  <div className="mt-5 space-y-3">
                    {executionSteps.map((step, index) => (
                      <div key={step.title} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                            {index + 1}
                          </div>
                          <h3 className="font-medium text-foreground">{step.title}</h3>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-black/5 px-5 py-5 sm:px-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className={surfaceClassName()}>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">实现硬约束</p>
                      <p className="text-sm text-muted-foreground">这些约束会继续影响后续页面和协作能力的落地。</p>
                    </div>

                    <div className="mt-5 space-y-3">
                      {guardrails.map((guardrail) => (
                        <div key={guardrail.label} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                          <div className="mb-1 flex items-center gap-2">
                            <Sparkles className="size-4 text-muted-foreground" />
                            <h3 className="font-medium text-foreground">{guardrail.label}</h3>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">{guardrail.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={surfaceClassName()}>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">实施阶段</p>
                      <p className="text-sm text-muted-foreground">阶段状态已经按当前代码库的真实进度更新。</p>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {milestones.map((milestone) => (
                        <div key={milestone.phase} className="rounded-[20px] border border-black/5 bg-[#fcfcfd] p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                                {milestone.phase}
                              </p>
                              <h3 className="font-medium text-foreground">{milestone.title}</h3>
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
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="border-t border-black/5 bg-[#fafafb] p-5 sm:p-6 xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">当前产品状态</p>
                    <p className="text-sm text-muted-foreground">首页反映的是当前真实开发进度，而不是最初的迁移计划。</p>
                  </div>

                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between rounded-[18px] border border-black/5 bg-[#fcfcfd] px-4 py-3">
                      <span>当前主入口</span>
                      <span className="font-medium text-foreground">Dashboard / Tasks</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] border border-black/5 bg-[#fcfcfd] px-4 py-3">
                      <span>已可用节点</span>
                      <span className="font-medium text-foreground">text / image / video</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] border border-black/5 bg-[#fcfcfd] px-4 py-3">
                      <span>权限模型</span>
                      <span className="font-medium text-foreground">owner / admin / editor / viewer</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] border border-black/5 bg-[#fcfcfd] px-4 py-3">
                      <span>当前重心</span>
                      <span className="font-medium text-foreground">前端业务承接</span>
                    </div>
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">入口建议</p>
                    <p className="text-sm text-muted-foreground">先登录进入 workspace，再从工作台延伸到画布与任务。</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link className={workspaceLinkClass(true)} href="/login">
                      去登录
                    </Link>
                    <Link className={workspaceLinkClass(false)} href="/register">
                      去注册
                    </Link>
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
