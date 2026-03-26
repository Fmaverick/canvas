import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listWorkspaceMembers } from "@/application/services/workspace-member-service";
import { WorkspaceMembersPanel } from "@/components/workspace/workspace-members-panel";
import { Badge } from "@/components/ui/badge";

type WorkspaceMembersPageProps = {
  params: Promise<{
    workspaceId: string;
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
  viewer: "只读访问，可查看成员、任务与资源状态。",
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

export default async function WorkspaceMembersPage({ params }: WorkspaceMembersPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/workspaces/members", {
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
            成员管理
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后查看团队成员</h1>
            <p className="text-base leading-7 text-muted-foreground">成员管理依赖当前登录态和 workspace 角色权限。</p>
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

  const { workspaceId } = await params;
  const activeWorkspace = currentUserResult.workspaces.find((workspace) => workspace.id === workspaceId);

  if (!activeWorkspace) {
    return (
      <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col items-center justify-center gap-6 rounded-[28px] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <Badge variant="destructive">无权访问</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">当前团队空间不存在或你没有访问权限</h1>
            <p className="text-base leading-7 text-muted-foreground">请返回工作台切换到可访问空间后再试。</p>
          </div>
          <Link className={actionLinkClass(true)} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </main>
    );
  }

  if (activeWorkspace.type !== "team") {
    return (
      <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col items-center justify-center gap-6 rounded-[28px] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <Badge variant="outline" className="border-black/8 bg-[#fcfcfd] text-foreground">
            Personal Workspace
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">个人空间不需要成员管理</h1>
            <p className="text-base leading-7 text-muted-foreground">
              只有 team workspace 才支持成员邀请、角色调整和成员移除。
            </p>
          </div>
          <Link className={actionLinkClass(true)} href={`/dashboard?workspaceId=${workspaceId}`}>
            返回工作台
          </Link>
        </div>
      </main>
    );
  }

  const members = await listWorkspaceMembers({
    workspaceId,
    actorUserId: currentUserResult.user.id,
  });
  const canManage = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const activeMemberCount = members.filter((member) => member.status === "active").length;
  const invitedMemberCount = members.filter((member) => member.status === "invited").length;
  const removedMemberCount = members.filter((member) => member.status === "removed").length;
  const activeTeamWorkspaces = currentUserResult.workspaces.filter((workspace) => workspace.type === "team");
  const collaborationSummary = canManage
    ? "你当前可以邀请账号、调整角色并维护共享范围。"
    : "你当前只能查看团队成员与权限分布，管理操作需要 owner 或 admin。";
  const overviewStats = [
    { label: "当前角色", value: roleLabel[activeWorkspace.role as keyof typeof roleLabel], accent: "bg-[#f7f7f8]" },
    { label: "活跃成员", value: String(activeMemberCount), accent: "bg-[#f2f8f3]" },
    { label: "待接受邀请", value: String(invitedMemberCount), accent: "bg-[#f5f7ff]" },
    { label: "已移除成员", value: String(removedMemberCount), accent: "bg-[#fff4ed]" },
  ];
  const permissionCards = [
    {
      role: "Owner",
      description: "拥有完整权限，角色固定，不可移除，可维护成员与共享资源。",
    },
    {
      role: "Admin",
      description: "可邀请成员、调整角色，并参与资源编辑与生成。",
    },
    {
      role: "Editor",
      description: "可编辑主体、场景、指令与画布，但不能管理成员。",
    },
    {
      role: "Viewer",
      description: "适合只读协作场景，可查看资源、任务与成员状态。",
    },
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
                      Members
                    </span>
                    <span className="hidden sm:inline">{activeWorkspace.name}</span>
                    <span className="hidden rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs sm:inline">
                      {roleLabel[activeWorkspace.role as keyof typeof roleLabel]}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">成员与共享权限</h1>
                  <p className="text-sm text-muted-foreground">延续资源库的轻量工作台表达，聚焦邀请、角色与共享边界。</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link className={actionLinkClass(true)} href={`/dashboard?workspaceId=${workspaceId}`}>
                  返回工作台
                </Link>
                <Link className={actionLinkClass(false)} href={`/libraries?workspaceId=${workspaceId}`}>
                  资源库
                </Link>
                <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${workspaceId}`}>
                  任务中心
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

              <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">协作说明</p>
                      <p className="text-sm text-muted-foreground">在邀请前先统一共享规则和角色职责。</p>
                    </div>
                    <Badge variant="outline" className="border-black/8 bg-[#fafafb] text-foreground">
                      {canManage ? "可管理" : "只读"}
                    </Badge>
                  </div>

                  <div className="mt-4 rounded-[20px] bg-[#fcfcfd] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                        Team Workspace
                      </Badge>
                      <Badge variant="outline" className="border-black/8 bg-white text-foreground">
                        {roleLabel[activeWorkspace.role as keyof typeof roleLabel]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{collaborationSummary}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {permissionCards.map((item) => (
                      <div key={item.role} className="rounded-[18px] border border-black/5 bg-[#fcfcfd] p-4">
                        <p className="text-sm font-medium text-foreground">{item.role}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={surfaceClassName()}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">成员操作台</p>
                      <p className="text-sm text-muted-foreground">在同一视图里完成邀请、角色调整与成员移除。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-[#fafafb] px-2.5 py-1 text-xs text-muted-foreground">
                      {members.length} 位成员
                    </span>
                  </div>

                  <div className="mt-5">
                    <WorkspaceMembersPanel canManage={canManage} members={members} workspaceId={workspaceId} />
                  </div>
                </div>
              </div>
            </section>

            <aside className="border-t border-black/5 bg-[#fafafb] p-5 sm:p-6 xl:border-t-0 xl:border-l">
              <div className="space-y-6">
                <div className={surfaceClassName(true)}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">当前空间</p>
                    <p className="text-sm text-muted-foreground">团队成员会共享主体、场景、指令与画布上下文。</p>
                  </div>

                  <div className="mt-4 rounded-[18px] bg-[#fcfcfd] p-4">
                    <p className="text-sm font-medium text-foreground">{activeWorkspace.name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {roleDescription[activeWorkspace.role as keyof typeof roleDescription]}
                    </p>
                  </div>
                </div>

                <div className={surfaceClassName(true)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">团队空间</p>
                      <p className="text-sm text-muted-foreground">快速切到其他 team workspace 查看共享范围。</p>
                    </div>
                    <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-xs text-muted-foreground">
                      {activeTeamWorkspaces.length}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeTeamWorkspaces.map((workspace) => (
                      <Link
                        key={workspace.id}
                        className={workspaceLinkClass(workspace.id === activeWorkspace.id)}
                        href={`/workspaces/${workspace.id}/members`}
                      >
                        {workspace.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className={surfaceClassName(true)}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">共享路径</p>
                    <p className="text-sm text-muted-foreground">成员权限配置完成后，可直接进入资源与任务视图继续协作。</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <Link
                      className="block rounded-[18px] border border-black/5 bg-white px-4 py-3 transition hover:border-black/10"
                      href={`/libraries?workspaceId=${workspaceId}`}
                    >
                      <p className="text-sm font-medium text-foreground">进入资源库</p>
                      <p className="mt-1 text-sm text-muted-foreground">确认主体、场景和指令是否已经共享给团队。</p>
                    </Link>
                    <Link
                      className="block rounded-[18px] border border-black/5 bg-white px-4 py-3 transition hover:border-black/10"
                      href={`/tasks?workspaceId=${workspaceId}`}
                    >
                      <p className="text-sm font-medium text-foreground">进入任务中心</p>
                      <p className="mt-1 text-sm text-muted-foreground">查看协作后的运行结果与任务状态分布。</p>
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
