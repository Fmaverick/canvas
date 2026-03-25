import Link from "next/link";
import { cookies } from "next/headers";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { listInstructionPresets } from "@/application/services/instruction-preset-service";
import { listLibraryItems } from "@/application/services/library-item-service";
import { LibrariesStudio } from "@/components/workspace/libraries-studio";
import { Badge } from "@/components/ui/badge";

type LibrariesPageProps = {
  searchParams?: Promise<{
    workspaceId?: string;
  }>;
};

function actionLinkClass(active: boolean) {
  return active
    ? "inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex items-center rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted";
}

export default async function LibrariesPage({ searchParams }: LibrariesPageProps) {
  const cookieStore = await cookies();
  const request = new Request("http://localhost/libraries", {
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
          <Badge>资源库</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">请先登录后查看主体库、场景库与指令库</h1>
            <p className="text-base leading-7 text-muted-foreground">
              资源库依赖当前会话来解析 workspace 归属、权限范围以及 personal / workspace 级别的指令可见性。
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
  const canEdit = activeWorkspace.role === "owner" || activeWorkspace.role === "admin" || activeWorkspace.role === "editor";

  const [subjects, scenes, instructionPresets] = await Promise.all([
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "subject" }),
    listLibraryItems({ workspaceId: activeWorkspace.id, kind: "scene" }),
    listInstructionPresets({ workspaceId: activeWorkspace.id, userId: currentUserResult.user.id }),
  ]);

  return (
    <LibrariesStudio
      canEdit={canEdit}
      instructionPresets={instructionPresets}
      scenes={scenes}
      subjects={subjects}
      workspaceId={activeWorkspace.id}
      workspaceName={activeWorkspace.name}
      workspaceRole={activeWorkspace.role}
    />
  );
}
