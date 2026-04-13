import JSZip from "jszip";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getBatchRunCombinationItemDetail, getNodeRunBatch } from "@/application/services/task-service";
import { ApiError } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    batchRunId: string;
    itemId: string;
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
    throw new ApiError(502, "BATCH_ITEM_DOWNLOAD_FETCH_FAILED", `远程结果文件拉取失败：${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  zip.file(filePath, arrayBuffer);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { batchRunId, itemId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId");
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, requestedWorkspaceId, "view");
    const [batchRun, item] = await Promise.all([
      getNodeRunBatch({
        workspaceId,
        batchRunId,
      }),
      getBatchRunCombinationItemDetail({
        workspaceId,
        batchRunId,
        combinationItemId: itemId,
      }),
    ]);
    const zip = new JSZip();
    const zipName = `batch-run-${batchRun.id}-item-${String(item.itemIndex + 1).padStart(3, "0")}.zip`;

    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          batchRunId: batchRun.id,
          batchStatus: batchRun.status,
          combinationItemId: item.id,
          itemIndex: item.itemIndex,
          label: item.label,
          status: item.status,
          attemptCount: item.attemptCount,
          bindingSummary: item.bindingSummary,
          inputBindings: item.inputBindings,
          lastErrorCode: item.lastErrorCode,
          lastErrorMessage: item.lastErrorMessage,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
        null,
        2,
      ),
    );

    for (const resultIndex of item.resultIndexes) {
      const baseName = `${String(item.itemIndex + 1).padStart(3, "0")}-${sanitizeSegment(resultIndex.nodeTitle)}-${resultIndex.nodeRunId}`;

      zip.file(
        `${baseName}.meta.json`,
        JSON.stringify(
          {
            id: resultIndex.id,
            nodeRunId: resultIndex.nodeRunId,
            taskId: resultIndex.taskId,
            requestId: resultIndex.requestId,
            status: resultIndex.status,
            nodeId: resultIndex.nodeId,
            nodeType: resultIndex.nodeType,
            resultType: resultIndex.resultType,
            errorCode: resultIndex.errorCode,
            errorMessage: resultIndex.errorMessage,
            resultMeta: resultIndex.resultMeta,
            startedAt: resultIndex.startedAt,
            finishedAt: resultIndex.finishedAt,
            createdAt: resultIndex.createdAt,
          },
          null,
          2,
        ),
      );

      if (resultIndex.status !== "succeeded") {
        continue;
      }

      if (resultIndex.assetFileUrl) {
        const extension = inferExtension({
          resultType: resultIndex.resultType,
          assetFileName: resultIndex.assetFileName,
          assetMimeType: resultIndex.assetMimeType,
          assetFileUrl: resultIndex.assetFileUrl,
        });

        try {
          await addRemoteFile(zip, `${baseName}.${extension}`, resultIndex.assetFileUrl);
          continue;
        } catch {
          zip.file(`${baseName}.url.txt`, resultIndex.assetFileUrl);
          continue;
        }
      }

      if (typeof resultIndex.contentText === "string" && resultIndex.contentText.length > 0) {
        const extension = inferExtension({
          resultType: resultIndex.resultType,
        });
        zip.file(`${baseName}.${extension}`, resultIndex.contentText);
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

    return new Response(error instanceof Error ? error.message : "单实例导出失败。", { status: 500 });
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
