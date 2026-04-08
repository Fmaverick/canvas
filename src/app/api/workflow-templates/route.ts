import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createWorkflowTemplate,
  createWorkflowTemplateInputSchema,
  listWorkflowTemplates,
} from "@/application/services/workflow-template-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const templates = await listWorkflowTemplates({
      workspaceId,
      userId: currentUser.user.id,
    });

    return jsonSuccess(templates, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const template = await createWorkflowTemplate(
      createWorkflowTemplateInputSchema.parse({
        ...body,
        workspaceId,
        userId: currentUser.user.id,
      }),
    );

    return jsonSuccess(template, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
