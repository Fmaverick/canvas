import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getRequestId } from "@/lib/api";
import { subscribeCanvasRuntime } from "@/lib/canvas-runtime-events";

import { getCanvasRuntimeSnapshot } from "../route";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

function buildSseMessage(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId } = await context.params;
    const encoder = new TextEncoder();

    let unsubscribe: (() => void) | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sendSnapshot = async () => {
          const snapshot = await getCanvasRuntimeSnapshot(workspaceId, canvasId);
          controller.enqueue(encoder.encode(buildSseMessage("snapshot", snapshot)));
        };

        try {
          controller.enqueue(
            encoder.encode(
              buildSseMessage("connected", {
                requestId,
                workspaceId,
                canvasId,
              }),
            ),
          );
          await sendSnapshot();

          unsubscribe = subscribeCanvasRuntime(
            {
              workspaceId,
              canvasId,
            },
            () => {
              void sendSnapshot().catch((error) => {
                controller.enqueue(
                  encoder.encode(
                    buildSseMessage("error", {
                      message: error instanceof Error ? error.message : "画布运行态事件推送失败。",
                    }),
                  ),
                );
              });
            },
          );

          keepAliveTimer = setInterval(() => {
            controller.enqueue(
              encoder.encode(
                buildSseMessage("ping", {
                  ts: Date.now(),
                }),
              ),
            );
          }, 25000);
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              buildSseMessage("error", {
                message: error instanceof Error ? error.message : "画布运行态初始化失败。",
              }),
            ),
          );
          controller.close();
        }
      },
      cancel() {
        unsubscribe?.();

        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
        }
      },
    });

    request.signal.addEventListener("abort", () => {
      unsubscribe?.();

      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        data: null,
        error: {
          message: error instanceof Error ? error.message : "画布运行态订阅失败。",
        },
        request_id: requestId,
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
