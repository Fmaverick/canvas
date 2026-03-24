import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listWorkspaceMembers } from "@/application/services/workspace-member-service";
import { WorkspaceMembersPanel } from "@/components/workspace/workspace-members-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WorkspaceMembersPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex items-center rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted";
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
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <Badge>成员管理</Badge>
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
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
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
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <Badge variant="outline">Personal Workspace</Badge>
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
  const removedMemberCount = members.filter((member) => member.status === "removed").length;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border bg-background px-6 py-8 shadow-sm lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>成员管理</Badge>
                <Badge variant="outline">{activeWorkspace.name}</Badge>
                <Badge variant="outline">{activeWorkspace.role}</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">管理团队空间成员与角色</h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  当前页面已经接到正式 session 和 workspace 角色权限。owner/admin 可邀请成员、修改角色并移除成员。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className={actionLinkClass(true)} href={`/dashboard?workspaceId=${workspaceId}`}>
                返回工作台
              </Link>
              <Link className={actionLinkClass(false)} href={`/tasks?workspaceId=${workspaceId}`}>
                查看任务中心
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardDescription>当前角色</CardDescription>
              <CardTitle className="text-2xl">{activeWorkspace.role}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>活跃成员数</CardDescription>
              <CardTitle className="text-2xl">{activeMemberCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>已移除成员</CardDescription>
              <CardTitle className="text-2xl">{removedMemberCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>权限说明</CardTitle>
              <CardDescription>先把多人协作规则讲清楚，再进行邀请与角色变更。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="font-medium">Owner</p>
                <p className="text-sm text-muted-foreground">拥有完整权限，角色固定，不可被移除。</p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="font-medium">Admin</p>
                <p className="text-sm text-muted-foreground">可管理成员，可编辑资源并发起生成。</p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="font-medium">Editor</p>
                <p className="text-sm text-muted-foreground">可编辑资源并发起生成，但不能管理成员。</p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="font-medium">Viewer</p>
                <p className="text-sm text-muted-foreground">只读访问，可查看成员、任务和画布状态。</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>成员列表</CardTitle>
              <CardDescription>你可以在这里邀请成员、更新角色并移除团队成员。</CardDescription>
            </CardHeader>
            <CardContent>
              <WorkspaceMembersPanel canManage={canManage} members={members} workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
