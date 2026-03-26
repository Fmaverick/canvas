import { AudioLines, Clapperboard, ImageIcon, Type, Video } from "lucide-react";

export type CanvasNodeType = "text" | "image" | "video" | "audio" | "storyboard";
export type CanvasConnectionSemantic = "prompt" | "reference_image";

export type CanvasNodeReferenceAsset = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type CanvasNodeResourceRefs = {
  subjectIds: string[];
  sceneIds: string[];
  instructionPresetIds: string[];
  assetIds: string[];
};

export type LibraryItemOption = {
  id: string;
  kind: string;
  entityType: string | null;
  name: string;
  description: string | null;
  coverAssetId?: string | null;
  coverAssetUrl?: string | null;
  promptHints: string | null;
  tags: string[];
  assets?: CanvasNodeReferenceAsset[];
};

export type InstructionPresetOption = {
  id: string;
  scope: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  negativePrompt: string | null;
  tags: string[];
};

export type CanvasNode = {
  id: string;
  type: string;
  title: string;
  status: string;
  modelKey: string | null;
  promptInput: string | null;
  positionX: string;
  positionY: string;
  outputSnapshot: Record<string, unknown> | null;
  settingsJson: Record<string, unknown> | null;
  resourceRefs: CanvasNodeResourceRefs | null;
  referenceAssets?: CanvasNodeReferenceAsset[];
};

export type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  mergeMode: string;
  priority: number;
};

export type CanvasTask = {
  id: string;
  taskType: string;
  status: string;
  nodeId: string | null;
  nodeTitle: string | null;
  canvasName: string | null;
  retryCount: number;
  pollCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  nextPollAt: string | Date | null;
  createdAt: string | Date;
  finishedAt: string | Date | null;
};

export type CanvasBatchRunNode = {
  id: string;
  title: string;
  type: string;
};

export type CanvasBatchRunResult = {
  id: string;
  nodeId: string;
  taskId: string | null;
  requestId: string | null;
  runIndex: number | null;
  nodeType: string;
  nodeTitle: string;
  status: string;
  resultType: string | null;
  contentText: string | null;
  assetId: string | null;
  resultMeta: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
  createdAt: string | Date;
  assetFileName: string | null;
  assetFileUrl: string | null;
  assetMimeType: string | null;
};

export type CanvasBatchRunDetail = {
  id: string;
  mode: string;
  status: string;
  requestedRunCount: number;
  totalNodeRunCount: number;
  completedNodeRunCount: number;
  succeededNodeRunCount: number;
  failedNodeRunCount: number;
  selectedNodesJson: CanvasBatchRunNode[];
  createdAt: string | Date;
  updatedAt: string | Date;
  runs: CanvasBatchRunResult[];
};

export type InfiniteCanvasBoardProps = {
  workspaceId: string;
  canEdit: boolean;
  canGenerate: boolean;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  tasks: CanvasTask[];
  batchRuns: CanvasBatchRunDetail[];
  canvasId: string;
  subjects: LibraryItemOption[];
  scenes: LibraryItemOption[];
  instructionPresets: InstructionPresetOption[];
};

export type VideoGenerationMode = "reference" | "first_last" | "multi_shot";
export type VideoAspectSize = "9:16" | "16:9" | "1:1";

export type VideoNodeSettings = {
  generationMode: VideoGenerationMode;
  durationSec: number;
  size: VideoAspectSize;
  motionStrength: number;
  withAudio: boolean;
  firstFrameAssetId: string | null;
  lastFrameAssetId: string | null;
  referenceAssetIds: string[];
  shotPrompts: string[];
};

export type StoryboardNodeSettings = {
  shotCount: number;
  responseFormat: "json";
  templateFile: string;
};

export type StoryboardShotCharacter = {
  name: string;
  description: string;
};

export type StoryboardShotSuggestedAssets = {
  characters: string[];
  locations: string[];
};

export type StoryboardShot = {
  sequence: number;
  sceneLabel: string;
  duration: number | null;
  description: string;
  videoPrompt: string;
  emotion: string;
  camera: string;
  size: string;
  dialogue: string;
  characters: StoryboardShotCharacter[];
  suggestedAssetNames: string[];
  suggestedAssets: StoryboardShotSuggestedAssets;
};

export type QuickCreateOption = {
  label: string;
  value: CanvasNodeType;
  icon: typeof Type;
  tint: string;
  lightTint: string;
  description: string;
};

export const statusBadgeVariant = {
  idle: "outline",
  queued: "secondary",
  processing: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const;

export const GRID_MINOR_SIZE = 28;
export const GRID_MAJOR_SIZE = 140;
export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 132;
export const TEXT_NODE_SIZE = 220;
export const STORYBOARD_NODE_WIDTH = 420;
export const STORYBOARD_NODE_HEIGHT = 300;
export const IMAGE_NODE_MIN_WIDTH = 180;
export const IMAGE_NODE_MAX_WIDTH = 320;
export const IMAGE_NODE_MIN_HEIGHT = 140;
export const IMAGE_NODE_MAX_HEIGHT = 320;
export const VIDEO_NODE_WIDTH = 300;
export const VIDEO_NODE_HEIGHT = 180;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1.8;
export const TEXT_GENERATE_COOLDOWN_MS = 4000;
export const CANVAS_NODE_GROUP_SETTINGS_KEY = "groupId";

export const DEFAULT_VIDEO_NODE_SETTINGS: VideoNodeSettings = {
  generationMode: "reference",
  durationSec: 5,
  size: "9:16",
  motionStrength: 50,
  withAudio: false,
  firstFrameAssetId: null,
  lastFrameAssetId: null,
  referenceAssetIds: [],
  shotPrompts: [],
};

export const DEFAULT_STORYBOARD_NODE_SETTINGS: StoryboardNodeSettings = {
  shotCount: 6,
  responseFormat: "json",
  templateFile: "shotOutFormat.md",
};

export const quickCreateOptions: QuickCreateOption[] = [
  {
    label: "文本",
    value: "text",
    icon: Type,
    tint: "from-slate-100 to-slate-50",
    lightTint: "from-slate-100 to-slate-50",
    description: "文案、脚本、标题",
  },
  {
    label: "图片",
    value: "image",
    icon: ImageIcon,
    tint: "from-amber-100 to-lime-50",
    lightTint: "from-amber-100 to-lime-50",
    description: "主视觉、海报、KV",
  },
  {
    label: "视频",
    value: "video",
    icon: Video,
    tint: "from-rose-100 to-fuchsia-50",
    lightTint: "from-rose-100 to-fuchsia-50",
    description: "短视频、镜头生成",
  },
  {
    label: "音频",
    value: "audio",
    icon: AudioLines,
    tint: "from-emerald-100 to-cyan-50",
    lightTint: "from-emerald-100 to-cyan-50",
    description: "配音、音频草案",
  },
  {
    label: "分镜",
    value: "storyboard",
    icon: Clapperboard,
    tint: "from-violet-100 to-indigo-50",
    lightTint: "from-violet-100 to-indigo-50",
    description: "动态分镜、镜头脚本",
  },
];

export function getCanvasBatchRunTitle(batchRun: { selectedNodesJson: CanvasBatchRunNode[] }) {
  if (!Array.isArray(batchRun.selectedNodesJson) || batchRun.selectedNodesJson.length === 0) {
    return "未命名节点组";
  }

  const labels = batchRun.selectedNodesJson.map((node) => node.title).filter(Boolean).slice(0, 4);

  return labels.length > 0 ? labels.join("、") : "未命名节点组";
}

export function formatCanvasDateTime(value: string | Date | null) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim()),
    ),
  );
}

export function normalizeResourceRefs(value: Partial<CanvasNodeResourceRefs> | null | undefined): CanvasNodeResourceRefs {
  return {
    subjectIds: normalizeStringList(value?.subjectIds),
    sceneIds: normalizeStringList(value?.sceneIds),
    instructionPresetIds: normalizeStringList(value?.instructionPresetIds),
    assetIds: normalizeStringList(value?.assetIds),
  };
}

export function getCanvasConnectionSemantic(
  sourceType: string,
  targetType: string,
): CanvasConnectionSemantic | null {
  if (sourceType === "image" && targetType === "storyboard") {
    return "prompt";
  }

  if (
    (sourceType === "text" || sourceType === "storyboard") &&
    (targetType === "text" || targetType === "storyboard" || targetType === "image" || targetType === "video")
  ) {
    return "prompt";
  }

  if (sourceType === "image" && (targetType === "image" || targetType === "video")) {
    return "reference_image";
  }

  return null;
}

export function getCanvasConnectionLabel(sourceType: string, targetType: string) {
  const semantic = getCanvasConnectionSemantic(sourceType, targetType);

  if (semantic === "prompt") {
    return "Prompt";
  }

  if (semantic === "reference_image") {
    return "参考图";
  }

  return "连线";
}

export function canCanvasNodeStartConnection(nodeType: string) {
  return nodeType === "text" || nodeType === "storyboard" || nodeType === "image";
}

export function canCanvasNodeReceiveConnection(nodeType: string) {
  return nodeType === "text" || nodeType === "storyboard" || nodeType === "image" || nodeType === "video";
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getCanvasNodeDimensions(
  node: Pick<CanvasNode, "type" | "referenceAssets">,
  imagePreviewDimensions?: { width: number; height: number } | null,
) {
  const imageNodeSize = getImageNodeSize(imagePreviewDimensions);

  return {
    width:
      node.type === "text"
        ? TEXT_NODE_SIZE
        : node.type === "storyboard"
          ? STORYBOARD_NODE_WIDTH
          : node.type === "image"
            ? imageNodeSize.width
            : node.type === "video"
              ? VIDEO_NODE_WIDTH
              : NODE_WIDTH,
    height:
      node.type === "text"
        ? TEXT_NODE_SIZE
        : node.type === "storyboard"
          ? STORYBOARD_NODE_HEIGHT
          : node.type === "image"
            ? imageNodeSize.height
            : node.type === "video"
              ? VIDEO_NODE_HEIGHT
              : NODE_HEIGHT,
  };
}

export function getCanvasNodeGroupId(settingsJson: Record<string, unknown> | null | undefined) {
  const groupId = settingsJson?.[CANVAS_NODE_GROUP_SETTINGS_KEY];

  return typeof groupId === "string" && groupId.trim().length > 0 ? groupId.trim() : null;
}

export function setCanvasNodeGroupId(
  settingsJson: Record<string, unknown> | null | undefined,
  groupId: string | null,
) {
  const nextSettings = settingsJson ? { ...settingsJson } : {};

  if (groupId && groupId.trim().length > 0) {
    nextSettings[CANVAS_NODE_GROUP_SETTINGS_KEY] = groupId.trim();

    return nextSettings;
  }

  delete nextSettings[CANVAS_NODE_GROUP_SETTINGS_KEY];

  return Object.keys(nextSettings).length > 0 ? nextSettings : null;
}

export function normalizeVideoNodeSettings(
  settingsJson: Record<string, unknown> | null | undefined,
): VideoNodeSettings {
  const generationMode =
    settingsJson?.generationMode === "first_last" || settingsJson?.generationMode === "multi_shot"
      ? settingsJson.generationMode
      : "reference";
  const durationCandidate =
    typeof settingsJson?.durationSec === "number"
      ? settingsJson.durationSec
      : typeof settingsJson?.duration === "number"
        ? settingsJson.duration
        : DEFAULT_VIDEO_NODE_SETTINGS.durationSec;
  const motionStrengthCandidate =
    typeof settingsJson?.motionStrength === "number"
      ? settingsJson.motionStrength
      : DEFAULT_VIDEO_NODE_SETTINGS.motionStrength;
  const sizeCandidate = settingsJson?.size;
  const size: VideoAspectSize =
    sizeCandidate === "16:9" || sizeCandidate === "1:1" || sizeCandidate === "9:16"
      ? sizeCandidate
      : "9:16";

  return {
    generationMode,
    durationSec: clampNumber(Math.round(durationCandidate), 1, 30),
    size,
    motionStrength: clampNumber(Math.round(motionStrengthCandidate), 1, 100),
    withAudio: Boolean(settingsJson?.withAudio),
    firstFrameAssetId: typeof settingsJson?.firstFrameAssetId === "string" ? settingsJson.firstFrameAssetId : null,
    lastFrameAssetId: typeof settingsJson?.lastFrameAssetId === "string" ? settingsJson.lastFrameAssetId : null,
    referenceAssetIds: normalizeStringList(settingsJson?.referenceAssetIds),
    shotPrompts: normalizeStringList(settingsJson?.shotPrompts),
  };
}

export function serializeVideoNodeSettings(settings: VideoNodeSettings) {
  return {
    generationMode: settings.generationMode,
    duration: settings.durationSec,
    durationSec: settings.durationSec,
    size: settings.size,
    motionStrength: settings.motionStrength,
    withAudio: settings.withAudio,
    firstFrameAssetId: settings.firstFrameAssetId,
    lastFrameAssetId: settings.lastFrameAssetId,
    referenceAssetIds: settings.referenceAssetIds,
    shotPrompts: settings.shotPrompts,
  };
}

export function getPersistedVideoNodeSettings(settings: VideoNodeSettings): VideoNodeSettings {
  if (settings.generationMode === "first_last") {
    return {
      ...settings,
      referenceAssetIds: [],
      shotPrompts: [],
    };
  }

  if (settings.generationMode === "multi_shot") {
    return {
      ...settings,
      firstFrameAssetId: null,
      lastFrameAssetId: null,
      referenceAssetIds: [],
    };
  }

  return {
    ...settings,
    firstFrameAssetId: null,
    lastFrameAssetId: null,
    shotPrompts: [],
  };
}

export function getManagedVideoAssetIds(settings: VideoNodeSettings) {
  const persistedSettings = getPersistedVideoNodeSettings(settings);

  return Array.from(
    new Set(
      [persistedSettings.firstFrameAssetId, persistedSettings.lastFrameAssetId, ...persistedSettings.referenceAssetIds].filter(
        (assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0,
      ),
    ),
  );
}

export function getReferenceAssetById(
  referenceAssets: CanvasNodeReferenceAsset[] | undefined,
  assetId: string | null | undefined,
) {
  if (!assetId) {
    return null;
  }

  return referenceAssets?.find((asset) => asset.id === assetId) ?? null;
}

export function getTextNodeContent(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return "";
  }

  return typeof outputSnapshot.content === "string" ? outputSnapshot.content : "";
}

export function normalizeStoryboardNodeSettings(
  settingsJson: Record<string, unknown> | null | undefined,
): StoryboardNodeSettings {
  const shotCountCandidate =
    typeof settingsJson?.shotCount === "number" ? settingsJson.shotCount : DEFAULT_STORYBOARD_NODE_SETTINGS.shotCount;

  return {
    shotCount: clampNumber(Math.round(shotCountCandidate), 1, 24),
    responseFormat: "json",
    templateFile:
      typeof settingsJson?.templateFile === "string" && settingsJson.templateFile.trim().length > 0
        ? settingsJson.templateFile.trim()
        : DEFAULT_STORYBOARD_NODE_SETTINGS.templateFile,
  };
}

export function serializeStoryboardNodeSettings(settings: StoryboardNodeSettings) {
  return {
    shotCount: settings.shotCount,
    responseFormat: settings.responseFormat,
    templateFile: settings.templateFile,
  };
}

export function getStoryboardShotCount(outputSnapshot: Record<string, unknown> | null) {
  return getStoryboardShots(outputSnapshot).length;
}

export function getStoryboardRawShots(outputSnapshot: Record<string, unknown> | null) {
  const structuredData =
    outputSnapshot?.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const shots = structuredData?.shots;

  if (!Array.isArray(shots)) {
    return [];
  }

  return shots.filter((shot): shot is Record<string, unknown> => Boolean(shot && typeof shot === "object"));
}

export function getStoryboardShots(outputSnapshot: Record<string, unknown> | null): StoryboardShot[] {
  return getStoryboardRawShots(outputSnapshot)
    .map((shot, index) => {
      const shotRecord = shot as Record<string, unknown>;
      const characters = Array.isArray(shotRecord.characters)
        ? shotRecord.characters
            .map((character) => {
              if (!character || typeof character !== "object") {
                return null;
              }

              const characterRecord = character as Record<string, unknown>;

              return {
                name: typeof characterRecord.name === "string" ? characterRecord.name.trim() : "",
                description:
                  typeof characterRecord.description === "string" ? characterRecord.description.trim() : "",
              };
            })
            .filter((character): character is StoryboardShotCharacter => Boolean(character))
        : [];
      const suggestedAssetsRecord =
        shotRecord.suggestedAssets && typeof shotRecord.suggestedAssets === "object"
          ? (shotRecord.suggestedAssets as Record<string, unknown>)
          : null;
      const durationValue = shotRecord.duration;
      const duration =
        typeof durationValue === "number" && Number.isFinite(durationValue) ? Math.max(1, Math.round(durationValue)) : null;

      return {
        sequence:
          typeof shotRecord.sequence === "number" && Number.isFinite(shotRecord.sequence)
            ? Math.max(1, Math.round(shotRecord.sequence))
            : index + 1,
        sceneLabel: typeof shotRecord.sceneLabel === "string" ? shotRecord.sceneLabel.trim() : "",
        duration,
        description: typeof shotRecord.description === "string" ? shotRecord.description.trim() : "",
        videoPrompt: typeof shotRecord.videoPrompt === "string" ? shotRecord.videoPrompt.trim() : "",
        emotion: typeof shotRecord.emotion === "string" ? shotRecord.emotion.trim() : "",
        camera: typeof shotRecord.camera === "string" ? shotRecord.camera.trim() : "",
        size: typeof shotRecord.size === "string" ? shotRecord.size.trim() : "",
        dialogue: typeof shotRecord.dialogue === "string" ? shotRecord.dialogue.trim() : "",
        characters,
        suggestedAssetNames: normalizeStringList(shotRecord.suggestedAssetNames),
        suggestedAssets: {
          characters: normalizeStringList(suggestedAssetsRecord?.characters),
          locations: normalizeStringList(suggestedAssetsRecord?.locations),
        },
      };
    })
    .filter((shot): shot is StoryboardShot => Boolean(shot));
}

export function getStoryboardShotAssetNames(shot: StoryboardShot) {
  return Array.from(
    new Set([...shot.suggestedAssetNames, ...shot.suggestedAssets.characters, ...shot.suggestedAssets.locations]),
  );
}

export function getStoryboardTotalDuration(outputSnapshot: Record<string, unknown> | null) {
  return getStoryboardShots(outputSnapshot).reduce((total, shot) => total + (shot.duration ?? 0), 0);
}

export function getStoryboardPreviewText(outputSnapshot: Record<string, unknown> | null) {
  const structuredData =
    outputSnapshot?.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const shots = Array.isArray(structuredData?.shots) ? structuredData.shots : [];
  const firstShot = shots[0];

  if (firstShot && typeof firstShot === "object") {
    const firstShotRecord = firstShot as Record<string, unknown>;
    const candidates = [
      firstShotRecord.description,
      firstShotRecord.videoPrompt,
      firstShotRecord.sceneLabel,
      firstShotRecord.dialogue,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return getTextNodeContent(outputSnapshot);
}

export function getImageNodeOutputSource(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return null;
  }

  const structuredData =
    outputSnapshot.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const candidates = [structuredData?.imageUrl, structuredData?.dataUri, structuredData?.url, outputSnapshot.content];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    const markdownMatch = candidate.match(/!\[[^\]]*]\(([^)]+)\)/);

    if (markdownMatch?.[1]) {
      return markdownMatch[1];
    }

    if (candidate.startsWith("data:image/") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getImageNodePreview(
  outputSnapshot: Record<string, unknown> | null,
  referenceAssets: CanvasNodeReferenceAsset[] | undefined,
) {
  return getImageNodeOutputSource(outputSnapshot) ?? referenceAssets?.[0]?.fileUrl ?? null;
}

export function getVideoNodeOutputSource(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return null;
  }

  const structuredData =
    outputSnapshot.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const candidates = [structuredData?.videoUrl, structuredData?.url, outputSnapshot.content];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function inferImageExtension(source: string, mimeType?: string | null) {
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "png";
  }

  const dataMatch = source.match(/^data:image\/([^;]+)/i);

  if (dataMatch?.[1]) {
    return dataMatch[1];
  }

  const urlMatch = source.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);

  return urlMatch?.[1] ?? "png";
}

export function inferVideoExtension(source: string, mimeType?: string | null) {
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "mp4";
  }

  const urlMatch = source.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);

  return urlMatch?.[1] ?? "mp4";
}

export function isFormFieldTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function triggerDownload(source: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = source;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  anchor.target = "_blank";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function getImageNodeSize(dimensions?: { width: number; height: number } | null) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return {
      width: NODE_WIDTH,
      height: 220,
    };
  }

  const aspectRatio = dimensions.width / dimensions.height;

  if (aspectRatio >= 1) {
    const width = Math.min(IMAGE_NODE_MAX_WIDTH, Math.max(IMAGE_NODE_MIN_WIDTH, 220 * aspectRatio));
    const height = Math.min(IMAGE_NODE_MAX_HEIGHT, Math.max(IMAGE_NODE_MIN_HEIGHT, width / aspectRatio));

    return {
      width,
      height,
    };
  }

  const height = Math.min(IMAGE_NODE_MAX_HEIGHT, Math.max(IMAGE_NODE_MIN_HEIGHT, 220 / aspectRatio));
  const width = Math.min(IMAGE_NODE_MAX_WIDTH, Math.max(IMAGE_NODE_MIN_WIDTH, height * aspectRatio));

  return {
    width,
    height,
  };
}
