import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { applyWorkflowTemplate, applyWorkflowTemplateInputSchema } from "@/application/services/workflow-template-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const { templateId } = await context.params;
    const result = await applyWorkflowTemplate(
      applyWorkflowTemplateInputSchema.parse({
        ...body,
        workspaceId,
        userId: currentUser.user.id,
        templateId,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
