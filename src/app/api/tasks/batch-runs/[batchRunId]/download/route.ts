import JSZip from "jszip";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getNodeRunBatch } from "@/application/services/task-service";
import { ApiError } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    batchRunId: string;
  }>;
};

function sanitizeSegment(value: string) {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : "result";
}

function inferExtension(params: {
  resultType: string | null;
  assetFileName?: string | null;
  assetMimeType?: string | null;
  assetFileUrl?: string | null;
}) {
  if (params.assetFileName && params.assetFileName.includes(".")) {
    return params.assetFileName.split(".").pop() ?? "bin";
  }

  if (params.assetMimeType?.startsWith("image/")) {
    return params.assetMimeType.split("/")[1] ?? "png";
  }

  if (params.assetMimeType?.startsWith("video/")) {
    return params.assetMimeType.split("/")[1] ?? "mp4";
  }

  if (params.assetMimeType?.startsWith("audio/")) {
    return params.assetMimeType.split("/")[1] ?? "mp3";
  }

  if (params.assetFileUrl) {
    try {
      const pathname = new URL(params.assetFileUrl).pathname;
      const lastSegment = pathname.split("/").pop();

      if (lastSegment?.includes(".")) {
        return lastSegment.split(".").pop() ?? "bin";
      }
    } catch {}
  }

  if (params.resultType === "json") {
    return "json";
  }

  if (params.resultType === "text") {
    return "txt";
  }

  if (params.resultType === "video") {
    return "mp4";
  }

  if (params.resultType === "audio") {
    return "mp3";
  }

  return "bin";
}

async function addRemoteFile(zip: JSZip, filePath: string, url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new ApiError(502, "BATCH_DOWNLOAD_FETCH_FAILED", `远程结果文件拉取失败：${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  zip.file(filePath, arrayBuffer);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { batchRunId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId");
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, requestedWorkspaceId, "view");
    const batchRun = await getNodeRunBatch({
      workspaceId,
      batchRunId,
    });
    const zip = new JSZip();
    const zipName = `batch-run-${batchRun.id}.zip`;

    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          id: batchRun.id,
          mode: batchRun.mode,
          status: batchRun.status,
          requestedRunCount: batchRun.requestedRunCount,
          totalNodeRunCount: batchRun.totalNodeRunCount,
          completedNodeRunCount: batchRun.completedNodeRunCount,
          succeededNodeRunCount: batchRun.succeededNodeRunCount,
          failedNodeRunCount: batchRun.failedNodeRunCount,
          selectedNodes: batchRun.selectedNodesJson,
          createdAt: batchRun.createdAt,
          updatedAt: batchRun.updatedAt,
        },
        null,
        2,
      ),
    );

    for (const run of batchRun.runs) {
      const runFolder = zip.folder(`run-${String(run.runIndex ?? 0).padStart(3, "0")}`);

      if (!runFolder) {
        continue;
      }

      const baseName = `${sanitizeSegment(run.nodeTitle)}-${run.id}`;

      runFolder.file(
        `${baseName}.meta.json`,
        JSON.stringify(
          {
            id: run.id,
            taskId: run.taskId,
            requestId: run.requestId,
            status: run.status,
            nodeId: run.nodeId,
            nodeType: run.nodeType,
            resultType: run.resultType,
            errorCode: run.errorCode,
            errorMessage: run.errorMessage,
            resultMeta: run.resultMeta,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            createdAt: run.createdAt,
          },
          null,
          2,
        ),
      );

      if (run.status !== "succeeded") {
        continue;
      }

      if (run.assetFileUrl) {
        const extension = inferExtension({
          resultType: run.resultType,
          assetFileName: run.assetFileName,
          assetMimeType: run.assetMimeType,
          assetFileUrl: run.assetFileUrl,
        });

        try {
          await addRemoteFile(runFolder, `${baseName}.${extension}`, run.assetFileUrl);
          continue;
        } catch {
          runFolder.file(`${baseName}.url.txt`, run.assetFileUrl);
          continue;
        }
      }

      if (typeof run.contentText === "string" && run.contentText.length > 0) {
        const extension = inferExtension({
          resultType: run.resultType,
        });
        runFolder.file(`${baseName}.${extension}`, run.contentText);
      }
    }

    const content = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });

    return new Response(Buffer.from(content), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${zipName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return new Response(error.message, { status: error.status });
    }

    return new Response(error instanceof Error ? error.message : "批量下载失败。", { status: 500 });
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
