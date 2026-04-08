import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  deleteWorkflowTemplate,
  deleteWorkflowTemplateInputSchema,
  updateWorkflowTemplate,
  updateWorkflowTemplateInputSchema,
} from "@/application/services/workflow-template-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const { templateId } = await context.params;
    const template = await updateWorkflowTemplate(
      updateWorkflowTemplateInputSchema.parse({
        ...body,
        workspaceId,
        userId: currentUser.user.id,
        templateId,
      }),
    );

    return jsonSuccess(template, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { templateId } = await context.params;
    const template = await deleteWorkflowTemplate(
      deleteWorkflowTemplateInputSchema.parse({
        workspaceId,
        userId: currentUser.user.id,
        templateId,
      }),
    );

    return jsonSuccess(template, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
