import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { getCanvasDetail } from "@/application/services/canvas-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { listTasks } from "@/application/services/task-service";
import { InfiniteCanvasBoard } from "@/components/canvas/infinite-canvas-board";
import { normalizeResourceRefs } from "@/components/canvas/infinite-canvas-board.shared";
import { Badge } from "@/components/ui/badge";

type CanvasDetailPageProps = {
  params: Promise<{
    canvasId: string;
  }>;
  searchParams?: Promise<{
    workspaceId?: string;
  }>;
};

function actionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex items-center rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted";
}

async function resolveCanvasWorkspace(
  workspaceId: string | undefined,
  canvasId: string,
  workspaces: Array<{ id: string }>,
) {
  const candidateWorkspaceIds = workspaceId ? [workspaceId] : workspaces.map((workspace) => workspace.id);

  for (const candidateWorkspaceId of candidateWorkspaceIds) {
    try {
      const canvas = await getCanvasDetail({
        workspaceId: candidateWorkspaceId,
        canvasId,
      });

      return {
        workspaceId: candidateWorkspaceId,
        canvas,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export default async function CanvasDetailPage({ params, searchParams }: CanvasDetailPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/canvases/detail", {
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
          <Badge>画布详情</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后查看画布详情</h1>
            <p className="text-base leading-7 text-muted-foreground">
              画布页依赖当前会话来解析 workspace、角色权限与节点运行能力。
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

  const [{ canvasId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const resolvedCanvasWorkspace = await resolveCanvasWorkspace(
    resolvedSearchParams?.workspaceId,
    canvasId,
    currentUserResult.workspaces,
  );

  if (!resolvedCanvasWorkspace) {
    return (
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <Badge variant="destructive">画布不可访问</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">当前画布不存在或你没有访问权限</h1>
            <p className="text-base leading-7 text-muted-foreground">
              你可以返回工作台切换 workspace，或从任务中心重新进入相关画布。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link className={actionLinkClass(true)} href="/dashboard">
              返回工作台
            </Link>
            <Link className={actionLinkClass(false)} href="/tasks">
              查看任务中心
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { workspaceId, canvas } = resolvedCanvasWorkspace;
  const activeWorkspace =
    currentUserResult.workspaces.find((workspace) => workspace.id === workspaceId) ?? currentUserResult.workspaces[0];
  const [tasks, subjects, scenes, instructionPresets] = await Promise.all([
    listTasks({
      workspaceId,
      canvasId,
      limit: 50,
    }),
    listLibraryItems({ workspaceId, kind: "subject" }),
    listLibraryItems({ workspaceId, kind: "scene" }),
    listInstructionPresets({ workspaceId, userId: currentUserResult.user.id }),
  ]);
  const canEdit = activeWorkspace.role === "owner" || activeWorkspace.role === "admin" || activeWorkspace.role === "editor";
  const canGenerate = canEdit;
  const normalizedNodes = canvas.nodes.map((node) => ({
    ...node,
    resourceRefs: normalizeResourceRefs(node.resourceRefs),
  }));

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <InfiniteCanvasBoard
        canEdit={canEdit}
        canGenerate={canGenerate}
        canvasId={canvas.id}
        edges={canvas.edges}
        instructionPresets={instructionPresets}
        nodes={normalizedNodes}
        scenes={scenes}
        subjects={subjects}
        tasks={tasks}
        workspaceId={workspaceId}
      />
    </main>
  );
}
