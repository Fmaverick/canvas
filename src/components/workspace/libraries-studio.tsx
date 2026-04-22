"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ImageIcon, MessageSquare, Plus, RefreshCw, Search, Trash2, Upload, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WorkspaceRole = string;
type SectionKey = "subject" | "scene" | "instruction";
type EditableInstructionScope = "personal" | "workspace";

type LibraryItemVolcengineSync = {
  volcengine_asset_group_id: string | null;
  volcengine_project_name: string | null;
};

type LibraryAssetVolcengineSync = {
  sync_status: string;
  volcengine_asset_id: string | null;
  volcengine_asset_group_id: string | null;
  volcengine_project_name: string | null;
  last_synced_at: string | Date | null;
  last_sync_error_code: string | null;
  last_sync_error: string | null;
};

type LibraryItemRecord = {
  id: string;
  workspaceId: string;
  kind: string;
  entityType: string | null;
  name: string;
  description: string | null;
  coverAssetId?: string | null;
  coverAssetUrl?: string | null;
  promptHints: string | null;
  profileMeta?: Record<string, unknown>;
  tags: string[];
  volcengineSync?: LibraryItemVolcengineSync;
  status: string;
  createdBy: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InstructionPresetRecord = {
  id: string;
  workspaceId: string | null;
  createdBy: string;
  scope: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  negativePrompt: string | null;
  variableSchema: Record<string, unknown>;
  tags: string[];
  isPublic: boolean;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type LibraryDraft = {
  name: string;
  entityType: string;
  description: string;
  promptHints: string;
  tags: string;
};

type SubjectViewMode = "all" | "model" | "product";

type ModelProfileDraft = {
  gender: string;
  ageRange: string;
  makeupStyle: string;
  hairStyle: string;
  outfitStyle: string;
  ecommerceCategory: string;
  shootTexture: string;
  usageNotes: string;
  presetType: string;
};

type LibraryAssetRecord = {
  id: string;
  ownerId: string;
  ownerType: string;
  assetType: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  volcengineSync?: LibraryAssetVolcengineSync;
  createdAt: string | Date;
};

type PreviewAssetState = {
  title: string;
  fileName: string;
  fileUrl: string;
};

type BatchImportResult = {
  fileName: string;
  itemName: string;
  success: boolean;
  message: string;
};

type LibraryItemAssetSyncResult = {
  libraryItemId: string;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
  reusedAssetGroup: boolean;
  summary: {
    total: number;
    eligible: number;
    active: number;
    processing: number;
    failed: number;
    skipped: number;
    reused: number;
    created: number;
  };
};

type SubjectGenerationDraft = {
  mode: "text_to_image" | "image_to_image";
  instructionPresetId: string;
  prompt: string;
  referenceAssetIds: string[];
};

type InstructionDraft = {
  name: string;
  scope: EditableInstructionScope;
  description: string;
  promptTemplate: string;
  negativePrompt: string;
  tags: string;
};

type LibrariesStudioProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  workspaceRole: WorkspaceRole;
  canEdit: boolean;
  subjects: LibraryItemRecord[];
  scenes: LibraryItemRecord[];
  instructionPresets: InstructionPresetRecord[];
};

const roleLabel: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const sectionMeta = {
  subject: {
    title: "主体库",
    description: "承接商品主体、模特主体、IP 主体等统一内容资产。",
    emptyTitle: "还没有主体内容",
    emptyDescription: "先创建一个主体条目，后续可以直接在画布节点里引用。",
    searchPlaceholder: "搜索主体名称、标签或描述",
    createLabel: "新建主体",
    icon: Boxes,
    accentClass: "from-sky-500/15 via-sky-500/5 to-transparent",
  },
  scene: {
    title: "场景库",
    description: "沉淀布景、空间、光线和镜头氛围等场景资产。",
    emptyTitle: "还没有场景内容",
    emptyDescription: "先建立一个可复用场景，让节点引用更稳定。",
    searchPlaceholder: "搜索场景名称、标签或描述",
    createLabel: "新建场景",
    icon: ImageIcon,
    accentClass: "from-violet-500/15 via-violet-500/5 to-transparent",
  },
  instruction: {
    title: "指令库",
    description: "管理 prompt 模板、negative prompt 和个人或空间级复用策略。",
    emptyTitle: "还没有指令内容",
    emptyDescription: "把常用 prompt 模板沉淀下来，供节点和工作流复用。",
    searchPlaceholder: "搜索指令名称、标签或 prompt",
    createLabel: "新建指令",
    icon: MessageSquare,
    accentClass: "from-amber-500/15 via-amber-500/5 to-transparent",
  },
} as const;

const MODEL_ENTITY_TYPES = new Set(["model", "person"]);

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function isModelEntityType(value: string | null | undefined) {
  return typeof value === "string" && MODEL_ENTITY_TYPES.has(value.trim().toLowerCase());
}

function createEmptyModelProfileDraft(): ModelProfileDraft {
  return {
    gender: "",
    ageRange: "",
    makeupStyle: "",
    hairStyle: "",
    outfitStyle: "",
    ecommerceCategory: "",
    shootTexture: "",
    usageNotes: "",
    presetType: "",
  };
}

function buildModelProfileDraft(item: LibraryItemRecord | null): ModelProfileDraft {
  const profileMeta = item?.profileMeta && typeof item.profileMeta === "object" ? item.profileMeta : {};

  return {
    gender: typeof profileMeta.gender === "string" ? profileMeta.gender : "",
    ageRange: typeof profileMeta.ageRange === "string" ? profileMeta.ageRange : "",
    makeupStyle: typeof profileMeta.makeupStyle === "string" ? profileMeta.makeupStyle : "",
    hairStyle: typeof profileMeta.hairStyle === "string" ? profileMeta.hairStyle : "",
    outfitStyle: typeof profileMeta.outfitStyle === "string" ? profileMeta.outfitStyle : "",
    ecommerceCategory: typeof profileMeta.ecommerceCategory === "string" ? profileMeta.ecommerceCategory : "",
    shootTexture: typeof profileMeta.shootTexture === "string" ? profileMeta.shootTexture : "",
    usageNotes: typeof profileMeta.usageNotes === "string" ? profileMeta.usageNotes : "",
    presetType: typeof profileMeta.presetType === "string" ? profileMeta.presetType : "",
  };
}

function mergeModelProfileMeta(
  currentProfileMeta: Record<string, unknown> | undefined,
  modelProfileDraft: ModelProfileDraft,
  enabled: boolean,
) {
  const base = { ...(currentProfileMeta ?? {}) };

  if (!enabled) {
    return base;
  }

  return {
    ...base,
    gender: modelProfileDraft.gender.trim() || null,
    ageRange: modelProfileDraft.ageRange.trim() || null,
    makeupStyle: modelProfileDraft.makeupStyle.trim() || null,
    hairStyle: modelProfileDraft.hairStyle.trim() || null,
    outfitStyle: modelProfileDraft.outfitStyle.trim() || null,
    ecommerceCategory: modelProfileDraft.ecommerceCategory.trim() || null,
    shootTexture: modelProfileDraft.shootTexture.trim() || null,
    usageNotes: modelProfileDraft.usageNotes.trim() || null,
    presetType: modelProfileDraft.presetType.trim() || null,
  };
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚更新";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatVolcengineSyncStatus(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "已激活";
    case "processing":
      return "同步中";
    case "failed":
      return "同步失败";
    case "skipped":
      return "已跳过";
    default:
      return "未同步";
  }
}

function getVolcengineSyncStatusClass(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-700";
    case "processing":
      return "bg-amber-500/10 text-amber-700";
    case "failed":
      return "bg-rose-500/10 text-rose-700";
    case "skipped":
      return "bg-slate-500/10 text-slate-600";
    default:
      return "bg-slate-500/10 text-slate-600";
  }
}

function formatOptionalDate(value: string | Date | null | undefined) {
  if (!value) {
    return "未同步";
  }

  return formatDate(value);
}

function buildVolcengineSyncHint(sync?: LibraryAssetVolcengineSync) {
  if (!sync) {
    return "未读取到火山同步信息。";
  }

  if (sync.volcengine_asset_id) {
    return `asset://${sync.volcengine_asset_id}`;
  }

  if (sync.last_sync_error) {
    return sync.last_sync_error;
  }

  if (sync.sync_status === "processing") {
    return "素材仍在火山处理中，当前会回退使用公网 URL。";
  }

  if (sync.sync_status === "skipped") {
    return "当前素材不会同步到火山，将继续使用公网 URL。";
  }

  return "未生成火山素材 ID，视频请求将回退使用公网 URL。";
}

async function readImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("图片尺寸读取失败。"));
      image.src = objectUrl;
    });

    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createEmptyLibraryDraft(kind: "subject" | "scene"): LibraryDraft {
  return {
    name: "",
    entityType: kind === "subject" ? "product" : "studio",
    description: "",
    promptHints: "",
    tags: "",
  };
}

function createEmptyInstructionDraft(): InstructionDraft {
  return {
    name: "",
    scope: "workspace",
    description: "",
    promptTemplate: "",
    negativePrompt: "",
    tags: "",
  };
}

function createEmptyGenerationDraft(): SubjectGenerationDraft {
  return {
    mode: "text_to_image",
    instructionPresetId: "",
    prompt: "",
    referenceAssetIds: [],
  };
}

function buildGenerationDraftFromProfileMeta(item: LibraryItemRecord | null): SubjectGenerationDraft {
  if (!item?.profileMeta || typeof item.profileMeta !== "object") {
    return createEmptyGenerationDraft();
  }

  const generationState =
    "libraryGeneration" in item.profileMeta && item.profileMeta.libraryGeneration
      ? (item.profileMeta.libraryGeneration as Record<string, unknown>)
      : null;

  if (!generationState || typeof generationState !== "object") {
    return createEmptyGenerationDraft();
  }

  const mode = generationState.mode === "image_to_image" ? "image_to_image" : "text_to_image";
  const instructionPresetId =
    typeof generationState.instructionPresetId === "string" ? generationState.instructionPresetId : "";
  const prompt = typeof generationState.prompt === "string" ? generationState.prompt : "";
  const referenceAssetIds = Array.isArray(generationState.referenceAssetIds)
    ? generationState.referenceAssetIds.filter((value): value is string => typeof value === "string")
    : [];

  return {
    mode,
    instructionPresetId,
    prompt,
    referenceAssetIds,
  };
}

function buildLibraryItemProfileMeta(
  currentProfileMeta: Record<string, unknown> | undefined,
  generationDraft: SubjectGenerationDraft,
  modelProfileDraft?: ModelProfileDraft,
  isModel = false,
  assembledPrompt?: string,
) {
  return {
    ...mergeModelProfileMeta(currentProfileMeta, modelProfileDraft ?? createEmptyModelProfileDraft(), isModel),
    libraryGeneration: {
      mode: generationDraft.mode,
      instructionPresetId: generationDraft.instructionPresetId || null,
      prompt: generationDraft.prompt,
      referenceAssetIds: generationDraft.referenceAssetIds,
      assembledPrompt: assembledPrompt ?? null,
    },
  };
}

function buildGenerationPromptPreview(params: {
  item: Pick<LibraryItemRecord, "name" | "description" | "promptHints">;
  preset: InstructionPresetRecord | null;
  prompt: string;
}) {
  return [
    params.preset?.promptTemplate ?? null,
    params.item.name,
    params.item.description,
    params.item.promptHints,
    params.prompt,
    params.preset?.negativePrompt ? `Negative prompt: ${params.preset.negativePrompt}` : null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");
}

function readStoredAssembledPrompt(item: LibraryItemRecord | null) {
  if (!item?.profileMeta || typeof item.profileMeta !== "object") {
    return "";
  }

  const generationState =
    "libraryGeneration" in item.profileMeta && item.profileMeta.libraryGeneration
      ? (item.profileMeta.libraryGeneration as Record<string, unknown>)
      : null;

  if (!generationState || typeof generationState !== "object") {
    return "";
  }

  return typeof generationState.assembledPrompt === "string" ? generationState.assembledPrompt : "";
}

function buildLibraryDraft(item: LibraryItemRecord): LibraryDraft {
  return {
    name: item.name,
    entityType: item.entityType ?? "",
    description: item.description ?? "",
    promptHints: item.promptHints ?? "",
    tags: item.tags.join(", "),
  };
}

function buildInstructionDraft(item: InstructionPresetRecord): InstructionDraft {
  return {
    name: item.name,
    scope: item.scope === "personal" ? "personal" : "workspace",
    description: item.description ?? "",
    promptTemplate: item.promptTemplate,
    negativePrompt: item.negativePrompt ?? "",
    tags: item.tags.join(", "),
  };
}

function getImportItemName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim() || "未命名资源";
}

async function parseJsonResponse<T>(response: Response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error?.message ?? "请求失败。");
  }

  return result?.data as T;
}

export function LibrariesStudio({
  workspaceId,
  workspaceName,
  workspaceType,
  workspaceRole,
  canEdit,
  subjects,
  scenes,
  instructionPresets,
}: LibrariesStudioProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("subject");
  const [subjectItems, setSubjectItems] = useState(subjects);
  const [sceneItems, setSceneItems] = useState(scenes);
  const [instructionItems, setInstructionItems] = useState(instructionPresets);
  const [subjectViewMode, setSubjectViewMode] = useState<SubjectViewMode>("all");
  const [selectedModelTags, setSelectedModelTags] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(subjects[0]?.id ?? null);
  const [keyword, setKeyword] = useState("");
  const [libraryDraft, setLibraryDraft] = useState<LibraryDraft>(
    subjects[0] ? buildLibraryDraft(subjects[0]) : createEmptyLibraryDraft("subject"),
  );
  const [modelProfileDraft, setModelProfileDraft] = useState<ModelProfileDraft>(
    subjects[0] ? buildModelProfileDraft(subjects[0]) : createEmptyModelProfileDraft(),
  );
  const [instructionDraft, setInstructionDraft] = useState<InstructionDraft>(
    instructionPresets[0] ? buildInstructionDraft(instructionPresets[0]) : createEmptyInstructionDraft(),
  );
  const [createLibraryDraft, setCreateLibraryDraft] = useState<LibraryDraft>(createEmptyLibraryDraft("subject"));
  const [createModelProfileDraft, setCreateModelProfileDraft] = useState<ModelProfileDraft>(createEmptyModelProfileDraft());
  const [createInstructionDraft, setCreateInstructionDraft] = useState<InstructionDraft>(createEmptyInstructionDraft());
  const [subjectAssets, setSubjectAssets] = useState<LibraryAssetRecord[]>([]);
  const [subjectPreviewUrls, setSubjectPreviewUrls] = useState<Record<string, string>>({});
  const [sceneAssets, setSceneAssets] = useState<LibraryAssetRecord[]>([]);
  const [scenePreviewUrls, setScenePreviewUrls] = useState<Record<string, string>>({});
  const [sceneGenerationDraft, setSceneGenerationDraft] = useState<SubjectGenerationDraft>(createEmptyGenerationDraft());
  const [subjectGenerationDraft, setSubjectGenerationDraft] = useState<SubjectGenerationDraft>(createEmptyGenerationDraft());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [batchImportFiles, setBatchImportFiles] = useState<File[]>([]);
  const [batchImportTags, setBatchImportTags] = useState("");
  const [batchImportEntityType, setBatchImportEntityType] = useState("");
  const [batchImportResults, setBatchImportResults] = useState<BatchImportResult[] | null>(null);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingSubjectAssets, setIsLoadingSubjectAssets] = useState(false);
  const [isUploadingSubjectImages, setIsUploadingSubjectImages] = useState(false);
  const [isGeneratingSubjectImage, setIsGeneratingSubjectImage] = useState(false);
  const [deletingSubjectAssetId, setDeletingSubjectAssetId] = useState<string | null>(null);
  const [isSyncingAllSubjectAssets, setIsSyncingAllSubjectAssets] = useState(false);
  const [syncingSubjectAssetIds, setSyncingSubjectAssetIds] = useState<string[]>([]);
  const [latestGeneratedSubjectAsset, setLatestGeneratedSubjectAsset] = useState<LibraryAssetRecord | null>(null);
  const subjectImageInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoadingSceneAssets, setIsLoadingSceneAssets] = useState(false);
  const [isUploadingSceneImages, setIsUploadingSceneImages] = useState(false);
  const [isGeneratingSceneImage, setIsGeneratingSceneImage] = useState(false);
  const [deletingSceneAssetId, setDeletingSceneAssetId] = useState<string | null>(null);
  const [latestGeneratedSceneAsset, setLatestGeneratedSceneAsset] = useState<LibraryAssetRecord | null>(null);
  const sceneImageInputRef = useRef<HTMLInputElement | null>(null);
  const batchImportInputRef = useRef<HTMLInputElement | null>(null);
  const [previewAsset, setPreviewAsset] = useState<PreviewAssetState | null>(null);

  const activeMeta = sectionMeta[activeSection];
  const ActiveSectionIcon = activeMeta.icon;
  const allCounts = {
    subject: subjectItems.length,
    scene: sceneItems.length,
    instruction: instructionItems.length,
  };
  const isTeamWorkspace = workspaceType === "team";
  const canManageMembers = workspaceRole === "owner" || workspaceRole === "admin";
  const sharingTitle = isTeamWorkspace ? "共享资源库" : "个人资源库";
  const sharingDescription = isTeamWorkspace
    ? canManageMembers
      ? "邀请成员加入当前 team workspace 后，对方切换到这个空间即可直接使用这里的主体、场景和指令库。"
      : "当前页面已经是共享资源库。你可以直接使用这些资源，但成员邀请和角色调整需要 owner 或 admin 操作。"
    : "当前页面属于 personal workspace，资源默认私有，不支持直接邀请成员共享。";
  const currentSubjectItems = useMemo(() => {
    if (subjectViewMode === "all") {
      return subjectItems;
    }

    if (subjectViewMode === "model") {
      return subjectItems.filter((item) => isModelEntityType(item.entityType));
    }

    return subjectItems.filter((item) => !isModelEntityType(item.entityType));
  }, [subjectItems, subjectViewMode]);
  const availableModelTags = useMemo(
    () =>
      Array.from(
        new Set(
          subjectItems
            .filter((item) => isModelEntityType(item.entityType))
            .flatMap((item) => item.tags)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ),
    [subjectItems],
  );

  const currentItems = useMemo(() => {
    if (activeSection === "subject") {
      return currentSubjectItems;
    }

    if (activeSection === "scene") {
      return sceneItems;
    }

    return instructionItems;
  }, [activeSection, currentSubjectItems, instructionItems, sceneItems]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const keywordFilteredItems = !normalizedKeyword
      ? currentItems
      : currentItems.filter((item) => {
      const haystacks =
        "promptTemplate" in item
          ? [
              item.name,
              item.description ?? "",
              item.promptTemplate,
              item.negativePrompt ?? "",
              item.scope,
              ...item.tags,
            ]
          : [
              item.name,
              item.description ?? "",
              item.promptHints ?? "",
              item.entityType ?? "",
              ...item.tags,
            ];

      return haystacks.some((field) => field.toLowerCase().includes(normalizedKeyword));
    });

    if (activeSection !== "subject" || subjectViewMode !== "model" || selectedModelTags.length === 0) {
      return keywordFilteredItems;
    }

    return keywordFilteredItems.filter((item) => {
      if ("promptTemplate" in item) {
        return false;
      }

      return selectedModelTags.every((tag) => item.tags.includes(tag));
    });
  }, [activeSection, currentItems, keyword, selectedModelTags, subjectViewMode]);

  const selectedItem = useMemo(
    () => currentItems.find((item) => item.id === selectedId) ?? null,
    [currentItems, selectedId],
  );
  const isSelectedSubjectModel = activeSection === "subject" && !!selectedItem && !("promptTemplate" in selectedItem) && isModelEntityType(selectedItem.entityType);

  useEffect(() => {
    if (currentItems.length === 0) {
      setSelectedId(null);

      return;
    }

    if (!selectedId || !currentItems.some((item) => item.id === selectedId)) {
      setSelectedId(currentItems[0]?.id ?? null);
    }
  }, [currentItems, selectedId]);
  const selectedSubjectPreset = useMemo(
    () => instructionItems.find((preset) => preset.id === subjectGenerationDraft.instructionPresetId) ?? null,
    [instructionItems, subjectGenerationDraft.instructionPresetId],
  );
  const selectedScenePreset = useMemo(
    () => instructionItems.find((preset) => preset.id === sceneGenerationDraft.instructionPresetId) ?? null,
    [instructionItems, sceneGenerationDraft.instructionPresetId],
  );
  const subjectPromptPreview = useMemo(() => {
    if (activeSection !== "subject" || !selectedItem || "promptTemplate" in selectedItem) {
      return "";
    }

    return (
      buildGenerationPromptPreview({
        item: selectedItem,
        preset: selectedSubjectPreset,
        prompt: subjectGenerationDraft.prompt,
      }) || readStoredAssembledPrompt(selectedItem)
    );
  }, [activeSection, selectedItem, selectedSubjectPreset, subjectGenerationDraft.prompt]);
  const scenePromptPreview = useMemo(() => {
    if (activeSection !== "scene" || !selectedItem || "promptTemplate" in selectedItem) {
      return "";
    }

    return (
      buildGenerationPromptPreview({
        item: selectedItem,
        preset: selectedScenePreset,
        prompt: sceneGenerationDraft.prompt,
      }) || readStoredAssembledPrompt(selectedItem)
    );
  }, [activeSection, sceneGenerationDraft.prompt, selectedItem, selectedScenePreset]);

  useEffect(() => {
    if (selectedId && currentItems.some((item) => item.id === selectedId)) {
      return;
    }

    if (currentItems.length > 0) {
      setSelectedId(currentItems[0].id);

      return;
    }

    setSelectedId(null);
  }, [canEdit, currentItems, selectedId]);

  useEffect(() => {
    if (!selectedItem) {
      setIsDetailModalOpen(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    if (activeSection === "instruction") {
      if (!selectedItem) {
        setInstructionDraft(createEmptyInstructionDraft());

        return;
      }

      setInstructionDraft(buildInstructionDraft(selectedItem as InstructionPresetRecord));

      return;
    }

    const kind = activeSection === "subject" ? "subject" : "scene";

    if (!selectedItem) {
      setLibraryDraft(createEmptyLibraryDraft(kind));

      return;
    }

    setLibraryDraft(buildLibraryDraft(selectedItem as LibraryItemRecord));
    setModelProfileDraft(buildModelProfileDraft(selectedItem as LibraryItemRecord));
  }, [activeSection, selectedItem]);

  useEffect(() => {
    if (activeSection !== "subject" || !selectedItem) {
      setSubjectAssets([]);
      setLatestGeneratedSubjectAsset(null);
      setSubjectGenerationDraft(createEmptyGenerationDraft());

      return;
    }

    let isActive = true;
    setIsLoadingSubjectAssets(true);

    void (async () => {
      try {
        const assets = await parseJsonResponse<LibraryAssetRecord[]>(
          await fetch(`/api/library-items/${selectedItem.id}/assets`, {
            headers: {
              "x-workspace-id": workspaceId,
            },
          }),
        );

        if (!isActive) {
          return;
        }

        setSubjectAssets(assets.filter((asset) => asset.assetType === "image"));
        const firstImageAsset = assets.find((asset) => asset.assetType === "image");
        setSubjectPreviewUrls((current) =>
          firstImageAsset
            ? {
                ...current,
                [selectedItem.id]: firstImageAsset.fileUrl,
              }
            : current,
        );
        setSubjectGenerationDraft(buildGenerationDraftFromProfileMeta(selectedItem as LibraryItemRecord));
        setLatestGeneratedSubjectAsset(null);
      } catch (error) {
        if (isActive) {
          toast.error(error instanceof Error ? error.message : "主体图片加载失败。");
        }
      } finally {
        if (isActive) {
          setIsLoadingSubjectAssets(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [activeSection, selectedItem, workspaceId]);

  useEffect(() => {
    if (activeSection !== "scene" || !selectedItem) {
      setSceneAssets([]);
      setLatestGeneratedSceneAsset(null);
      setSceneGenerationDraft(createEmptyGenerationDraft());

      return;
    }

    let isActive = true;
    setIsLoadingSceneAssets(true);

    void (async () => {
      try {
        const assets = await parseJsonResponse<LibraryAssetRecord[]>(
          await fetch(`/api/library-items/${selectedItem.id}/assets`, {
            headers: {
              "x-workspace-id": workspaceId,
            },
          }),
        );

        if (!isActive) {
          return;
        }

        setSceneAssets(assets.filter((asset) => asset.assetType === "image"));
        const firstImageAsset = assets.find((asset) => asset.assetType === "image");
        setScenePreviewUrls((current) =>
          firstImageAsset
            ? {
                ...current,
                [selectedItem.id]: firstImageAsset.fileUrl,
              }
            : current,
        );
        setSceneGenerationDraft(buildGenerationDraftFromProfileMeta(selectedItem as LibraryItemRecord));
        setLatestGeneratedSceneAsset(null);
      } catch (error) {
        if (isActive) {
          toast.error(error instanceof Error ? error.message : "场景图片加载失败。");
        }
      } finally {
        if (isActive) {
          setIsLoadingSceneAssets(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [activeSection, selectedItem, workspaceId]);

  function switchSection(section: SectionKey) {
    const items = section === "subject" ? subjectItems : section === "scene" ? sceneItems : instructionItems;

    setActiveSection(section);
    setKeyword("");
    if (section !== "subject") {
      setSubjectViewMode("all");
      setSelectedModelTags([]);
    }
    setSelectedId(items[0]?.id ?? null);
    setIsDetailModalOpen(false);
  }

  function openCreate() {
    if (!canEdit) {
      return;
    }

    if (activeSection === "instruction") {
      setCreateInstructionDraft(createEmptyInstructionDraft());
    } else {
      const nextDraft = createEmptyLibraryDraft(activeSection === "subject" ? "subject" : "scene");

      if (activeSection === "subject" && subjectViewMode === "model") {
        nextDraft.entityType = "model";
      }

      setCreateLibraryDraft(nextDraft);
      setCreateModelProfileDraft(createEmptyModelProfileDraft());
    }

    setIsCreateModalOpen(true);
  }

  function openBatchImport() {
    if (activeSection !== "subject" && activeSection !== "scene") {
      return;
    }

    setBatchImportFiles([]);
    setBatchImportResults(null);
    setBatchImportTags("");
    setBatchImportEntityType(activeSection === "subject" ? (subjectViewMode === "model" ? "model" : "product") : "studio");
    setIsBatchImportOpen(true);
  }

  function openDetail(itemId: string) {
    setSelectedId(itemId);
    setIsDetailModalOpen(true);
  }

  async function uploadImagesToLibraryItem(itemId: string, imageFiles: File[]) {
    const uploadedAssets: LibraryAssetRecord[] = [];

    for (const file of imageFiles) {
      const { width, height } = await readImageDimensions(file);
      const uploadTicket = await parseJsonResponse<{
        uploadUrl: string;
        storageKey: string;
        headers?: Record<string, string>;
      }>(
        await fetch("/api/uploads/presign", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            fileName: file.name,
            mimeType: file.type,
            ownerType: "library_item",
            ownerId: itemId,
          }),
        }),
      );

      const uploadResponse = await fetch(uploadTicket.uploadUrl, {
        method: "PUT",
        headers: uploadTicket.headers,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`文件上传失败：${file.name}`);
      }

      const asset = await parseJsonResponse<LibraryAssetRecord>(
        await fetch("/api/uploads/complete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            fileName: file.name,
            mimeType: file.type,
            ownerType: "library_item",
            ownerId: itemId,
            storageKey: uploadTicket.storageKey,
            fileSize: file.size,
            width,
            height,
          }),
        }),
      );

      uploadedAssets.push(asset);
    }

    return uploadedAssets;
  }

  async function reloadSubjectItemAndAssets(itemId: string) {
    const [nextItem, nextAssets] = await Promise.all([
      parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${itemId}`, {
          headers: {
            "x-workspace-id": workspaceId,
          },
        }),
      ),
      parseJsonResponse<LibraryAssetRecord[]>(
        await fetch(`/api/library-items/${itemId}/assets`, {
          headers: {
            "x-workspace-id": workspaceId,
          },
        }),
      ),
    ]);
    const nextSubjectAssets = nextAssets.filter((asset) => asset.assetType === "image");
    const previewAssetUrl =
      nextSubjectAssets.find((asset) => asset.id === nextItem.coverAssetId)?.fileUrl ?? nextItem.coverAssetUrl ?? null;

    setSubjectItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setSubjectAssets(nextSubjectAssets);

    if (previewAssetUrl) {
      setSubjectPreviewUrls((current) => ({
        ...current,
        [nextItem.id]: previewAssetUrl,
      }));
    }
  }

  async function handleSyncSubjectAssets(assetIds?: string[]) {
    if (!selectedItem || activeSection !== "subject") {
      return;
    }

    const targetItem = selectedItem as LibraryItemRecord;
    const targetAssetIds = assetIds?.length ? assetIds : undefined;

    if (targetAssetIds) {
      setSyncingSubjectAssetIds((current) => Array.from(new Set([...current, ...targetAssetIds])));
    } else {
      setIsSyncingAllSubjectAssets(true);
    }

    try {
      const result = await parseJsonResponse<LibraryItemAssetSyncResult>(
        await fetch(`/api/library-items/${targetItem.id}/assets/sync`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            assetIds: targetAssetIds,
          }),
        }),
      );

      await reloadSubjectItemAndAssets(targetItem.id);

      if (result.summary.failed > 0) {
        toast.warning(
          `火山同步已完成，成功 ${result.summary.active} 张，处理中 ${result.summary.processing} 张，失败 ${result.summary.failed} 张。`,
        );
      } else {
        toast.success(
          `火山同步已完成，已激活 ${result.summary.active} 张${result.summary.processing > 0 ? `，处理中 ${result.summary.processing} 张` : ""}。`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "火山素材同步失败。");
    } finally {
      if (targetAssetIds) {
        setSyncingSubjectAssetIds((current) => current.filter((id) => !targetAssetIds.includes(id)));
      } else {
        setIsSyncingAllSubjectAssets(false);
      }
    }
  }

  async function createLibraryItemRecord(params: {
    kind: "subject" | "scene";
    entityType: string;
    name: string;
    tags: string[];
  }) {
    return parseJsonResponse<LibraryItemRecord>(
      await fetch("/api/library-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          workspaceId,
          kind: params.kind,
          entityType: params.entityType,
          name: params.name,
          tags: params.tags,
          description: "",
          promptHints: "",
          profileMeta: {},
        }),
      }),
    );
  }

  async function handleBatchImportSubmit() {
    if (!canEdit || (activeSection !== "subject" && activeSection !== "scene")) {
      return;
    }

    const imageFiles = batchImportFiles.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请至少选择一张图片。");

      return;
    }

    setIsBatchImporting(true);
    setBatchImportResults(null);

    const kind = activeSection;
    const normalizedTags = Array.from(
      new Set(
        batchImportTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    const importedItems: LibraryItemRecord[] = [];
    const nextPreviewUrls: Record<string, string> = {};
    const results: BatchImportResult[] = [];

    try {
      for (const file of imageFiles) {
        const itemName = getImportItemName(file.name);

        try {
          const createdItem = await createLibraryItemRecord({
            kind,
            entityType: batchImportEntityType.trim() || (kind === "subject" ? "product" : "studio"),
            name: itemName,
            tags: normalizedTags,
          });
          const uploadedAssets = await uploadImagesToLibraryItem(createdItem.id, [file]);
          let finalItem = createdItem;

          if (uploadedAssets[0]) {
            finalItem = await parseJsonResponse<LibraryItemRecord>(
              await fetch(`/api/library-items/${createdItem.id}`, {
                method: "PATCH",
                headers: {
                  "content-type": "application/json",
                  "x-workspace-id": workspaceId,
                },
                body: JSON.stringify({
                  workspaceId,
                  coverAssetId: uploadedAssets[0].id,
                }),
              }),
            );
            nextPreviewUrls[createdItem.id] = uploadedAssets[0].fileUrl;
          }

          importedItems.push(finalItem);
          results.push({
            fileName: file.name,
            itemName,
            success: true,
            message: "导入成功",
          });
        } catch (error) {
          results.push({
            fileName: file.name,
            itemName,
            success: false,
            message: error instanceof Error ? error.message : "导入失败",
          });
        }
      }

      if (importedItems.length > 0) {
        if (kind === "subject") {
          setSubjectItems((current) => [...importedItems, ...current]);
          setSubjectPreviewUrls((current) => ({
            ...nextPreviewUrls,
            ...current,
          }));
        } else {
          setSceneItems((current) => [...importedItems, ...current]);
          setScenePreviewUrls((current) => ({
            ...nextPreviewUrls,
            ...current,
          }));
        }

        setSelectedId(importedItems[0]?.id ?? null);
      }

      setBatchImportResults(results);
      const successCount = results.filter((item) => item.success).length;
      const failedCount = results.length - successCount;
      toast.success(`批量导入完成：成功 ${successCount} 条${failedCount > 0 ? `，失败 ${failedCount} 条` : ""}。`);
    } finally {
      setIsBatchImporting(false);
    }
  }

  async function createLibraryItem() {
    const kind = activeSection === "subject" ? "subject" : "scene";
    const draft = createLibraryDraft;

    if (!draft.name.trim()) {
      toast.error(`请输入${kind === "subject" ? "主体" : "场景"}名称。`);

      return;
    }

    setIsSaving(true);

    try {
      const isSubjectModel = kind === "subject" && isModelEntityType(draft.entityType);
      const createdItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch("/api/library-items", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            kind,
            name: draft.name.trim(),
            entityType: draft.entityType.trim() || undefined,
            description: draft.description.trim() || undefined,
            promptHints: draft.promptHints.trim() || undefined,
            tags: normalizeTags(draft.tags),
            profileMeta: mergeModelProfileMeta(undefined, createModelProfileDraft, isSubjectModel),
          }),
        }),
      );

      if (kind === "subject") {
        setSubjectItems((current) => [createdItem, ...current]);
      } else {
        setSceneItems((current) => [createdItem, ...current]);
      }

      setSelectedId(createdItem.id);
      setIsCreateModalOpen(false);
      toast.success(`${kind === "subject" ? "主体" : "场景"}已创建。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateLibraryItem() {
    const kind = activeSection === "subject" ? "subject" : "scene";

    if (!libraryDraft.name.trim()) {
      toast.error(`请输入${kind === "subject" ? "主体" : "场景"}名称。`);

      return;
    }

    if (!selectedItem) {
      return;
    }

    setIsSaving(true);

    try {
      const isSubjectModel = kind === "subject" && isModelEntityType(libraryDraft.entityType);
      const updatedItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            name: libraryDraft.name.trim(),
            entityType: libraryDraft.entityType.trim() || null,
            description: libraryDraft.description.trim() || null,
            promptHints: libraryDraft.promptHints.trim() || null,
            tags: normalizeTags(libraryDraft.tags),
            profileMeta: mergeModelProfileMeta(
              (selectedItem as LibraryItemRecord).profileMeta,
              modelProfileDraft,
              isSubjectModel,
            ),
          }),
        }),
      );

      if (kind === "subject") {
        setSubjectItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } else {
        setSceneItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      }

      toast.success(`${kind === "subject" ? "主体" : "场景"}已更新。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function createInstructionPreset() {
    if (!createInstructionDraft.name.trim() || !createInstructionDraft.promptTemplate.trim()) {
      toast.error("请输入指令名称和预制 Prompt。");

      return;
    }

    setIsSaving(true);

    try {
      const createdPreset = await parseJsonResponse<InstructionPresetRecord>(
        await fetch("/api/instruction-presets", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            scope: createInstructionDraft.scope,
            name: createInstructionDraft.name.trim(),
            description: createInstructionDraft.description.trim() || undefined,
            promptTemplate: createInstructionDraft.promptTemplate.trim(),
            negativePrompt: createInstructionDraft.negativePrompt.trim() || undefined,
            tags: normalizeTags(createInstructionDraft.tags),
          }),
        }),
      );

      setInstructionItems((current) => [createdPreset, ...current]);
      setSelectedId(createdPreset.id);
      setIsCreateModalOpen(false);
      toast.success("指令已创建。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateInstructionPreset() {
    if (!instructionDraft.name.trim() || !instructionDraft.promptTemplate.trim()) {
      toast.error("请输入指令名称和预制 Prompt。");

      return;
    }

    if (!selectedItem) {
      return;
    }

    setIsSaving(true);

    try {
      const updatedPreset = await parseJsonResponse<InstructionPresetRecord>(
        await fetch(`/api/instruction-presets/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            scope: instructionDraft.scope,
            name: instructionDraft.name.trim(),
            description: instructionDraft.description.trim() || null,
            promptTemplate: instructionDraft.promptTemplate.trim(),
            negativePrompt: instructionDraft.negativePrompt.trim() || null,
            tags: normalizeTags(instructionDraft.tags),
            isPublic: instructionDraft.scope === "workspace",
          }),
        }),
      );

      setInstructionItems((current) => current.map((item) => (item.id === updatedPreset.id ? updatedPreset : item)));
      toast.success("指令已更新。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadSubjectImages(files: FileList | null) {
    if (!files || !selectedItem || activeSection !== "subject") {
      return;
    }

    const subjectItem = selectedItem as LibraryItemRecord;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请选择图片文件。");

      return;
    }

    setIsUploadingSubjectImages(true);

    try {
      const uploadedAssets = await uploadImagesToLibraryItem(selectedItem.id, imageFiles);
      const nextCoverAssetId = subjectItem.coverAssetId ?? uploadedAssets[0]?.id ?? null;
      const nextCoverAssetUrl =
        uploadedAssets.find((asset) => asset.id === nextCoverAssetId)?.fileUrl ?? subjectItem.coverAssetUrl ?? null;

      if (!subjectItem.coverAssetId && uploadedAssets[0]) {
        const updatedItem = await parseJsonResponse<LibraryItemRecord>(
          await fetch(`/api/library-items/${selectedItem.id}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "x-workspace-id": workspaceId,
            },
            body: JSON.stringify({
              workspaceId,
              coverAssetId: uploadedAssets[0].id,
            }),
          }),
        );

        setSubjectItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } else {
        setSubjectItems((current) =>
          current.map((item) =>
            item.id === selectedItem.id
              ? {
                  ...item,
                  coverAssetId: nextCoverAssetId,
                  coverAssetUrl: nextCoverAssetUrl,
                  updatedAt: new Date(),
                }
              : item,
          ),
        );
      }

      if (uploadedAssets[0]) {
        setSubjectPreviewUrls((current) => ({
          ...current,
          [selectedItem.id]: nextCoverAssetUrl ?? uploadedAssets[0].fileUrl,
        }));
      }

      setSubjectAssets((current) => [...current, ...uploadedAssets]);
      setSubjectGenerationDraft((current) => ({
        ...current,
        referenceAssetIds: current.mode === "image_to_image"
          ? Array.from(new Set([...current.referenceAssetIds, ...uploadedAssets.map((asset) => asset.id)]))
          : current.referenceAssetIds,
      }));

      if (subjectImageInputRef.current) {
        subjectImageInputRef.current.value = "";
      }

      toast.success(`已上传 ${uploadedAssets.length} 张主体图片。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主体图片上传失败。");
    } finally {
      setIsUploadingSubjectImages(false);
    }
  }

  async function handleUploadSceneImages(files: FileList | null) {
    if (!files || !selectedItem || activeSection !== "scene") {
      return;
    }

    const sceneItem = selectedItem as LibraryItemRecord;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请选择图片文件。");

      return;
    }

    setIsUploadingSceneImages(true);

    try {
      const uploadedAssets = await uploadImagesToLibraryItem(selectedItem.id, imageFiles);
      const nextCoverAssetId = sceneItem.coverAssetId ?? uploadedAssets[0]?.id ?? null;
      const nextCoverAssetUrl =
        uploadedAssets.find((asset) => asset.id === nextCoverAssetId)?.fileUrl ?? sceneItem.coverAssetUrl ?? null;

      if (!sceneItem.coverAssetId && uploadedAssets[0]) {
        const updatedItem = await parseJsonResponse<LibraryItemRecord>(
          await fetch(`/api/library-items/${selectedItem.id}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "x-workspace-id": workspaceId,
            },
            body: JSON.stringify({
              workspaceId,
              coverAssetId: uploadedAssets[0].id,
            }),
          }),
        );

        setSceneItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } else {
        setSceneItems((current) =>
          current.map((item) =>
            item.id === selectedItem.id
              ? {
                  ...item,
                  coverAssetId: nextCoverAssetId,
                  coverAssetUrl: nextCoverAssetUrl,
                  updatedAt: new Date(),
                }
              : item,
          ),
        );
      }

      if (uploadedAssets[0]) {
        setScenePreviewUrls((current) => ({
          ...current,
          [selectedItem.id]: nextCoverAssetUrl ?? uploadedAssets[0].fileUrl,
        }));
      }

      setSceneAssets((current) => [...current, ...uploadedAssets]);
      setSceneGenerationDraft((current) => ({
        ...current,
        referenceAssetIds:
          current.mode === "image_to_image"
            ? Array.from(new Set([...current.referenceAssetIds, ...uploadedAssets.map((asset) => asset.id)]))
            : current.referenceAssetIds,
      }));

      if (sceneImageInputRef.current) {
        sceneImageInputRef.current.value = "";
      }

      toast.success(`已上传 ${uploadedAssets.length} 张场景图片。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景图片上传失败。");
    } finally {
      setIsUploadingSceneImages(false);
    }
  }

  async function handleGenerateSubjectImage() {
    if (activeSection !== "subject" || !selectedItem) {
      return;
    }

    if (
      subjectGenerationDraft.mode === "image_to_image" &&
      subjectGenerationDraft.referenceAssetIds.length === 0
    ) {
      toast.error("图生图至少需要选择一张参考图。");

      return;
    }

    const subjectItem = selectedItem as LibraryItemRecord;
    const selectedPreset =
      instructionItems.find((preset) => preset.id === subjectGenerationDraft.instructionPresetId) ?? null;
    const assembledPrompt = buildGenerationPromptPreview({
      item: subjectItem,
      preset: selectedPreset,
      prompt: subjectGenerationDraft.prompt,
    });

    if (!assembledPrompt.trim()) {
      toast.error("请先填写提示词或选择预制指令。");

      return;
    }

    setIsGeneratingSubjectImage(true);

    try {
      const persistedProfileMeta = buildLibraryItemProfileMeta(
        subjectItem.profileMeta,
        subjectGenerationDraft,
        modelProfileDraft,
        isModelEntityType(subjectItem.entityType),
        assembledPrompt,
      );
      const persistedItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            profileMeta: persistedProfileMeta,
          }),
        }),
      );

      setSubjectItems((current) => current.map((item) => (item.id === persistedItem.id ? persistedItem : item)));

      const result = await parseJsonResponse<{
        taskId: string;
        status: string;
        assetId?: string | null;
        asset?: LibraryAssetRecord;
      }>(
        await fetch(`/api/library-items/${selectedItem.id}/generate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            mode: subjectGenerationDraft.mode,
            instructionPresetId: subjectGenerationDraft.instructionPresetId || undefined,
            prompt: subjectGenerationDraft.prompt.trim() || undefined,
            referenceAssetIds: subjectGenerationDraft.referenceAssetIds,
            assembledPrompt,
            requestId: `library-item-generate-${crypto.randomUUID()}`,
          }),
        }),
      );

      if (result.asset) {
        const generatedAsset = result.asset;

        setLatestGeneratedSubjectAsset(generatedAsset);
        setSubjectAssets((current) => {
          const exists = current.some((asset) => asset.id === generatedAsset.id);

          return exists ? current : [...current, generatedAsset];
        });
        setSubjectItems((current) =>
          current.map((item) =>
            item.id === selectedItem.id
              ? {
                  ...item,
                  coverAssetId: generatedAsset.id,
                  coverAssetUrl: generatedAsset.fileUrl,
                  profileMeta: persistedProfileMeta,
                  updatedAt: new Date(),
                }
              : item,
          ),
        );
        setSubjectPreviewUrls((current) => ({
          ...current,
          [selectedItem.id]: generatedAsset.fileUrl,
        }));
      }

      toast.success(subjectGenerationDraft.mode === "image_to_image" ? "图生图已完成。" : "文生图已完成。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主体图片生成失败。");
    } finally {
      setIsGeneratingSubjectImage(false);
    }
  }

  async function handleGenerateSceneImage() {
    if (activeSection !== "scene" || !selectedItem) {
      return;
    }

    if (sceneGenerationDraft.mode === "image_to_image" && sceneGenerationDraft.referenceAssetIds.length === 0) {
      toast.error("图生图至少需要选择一张参考图。");

      return;
    }

    const sceneItem = selectedItem as LibraryItemRecord;
    const selectedPreset =
      instructionItems.find((preset) => preset.id === sceneGenerationDraft.instructionPresetId) ?? null;
    const assembledPrompt = buildGenerationPromptPreview({
      item: sceneItem,
      preset: selectedPreset,
      prompt: sceneGenerationDraft.prompt,
    });

    if (!assembledPrompt.trim()) {
      toast.error("请先填写提示词或选择预制指令。");

      return;
    }

    setIsGeneratingSceneImage(true);

    try {
      const persistedProfileMeta = buildLibraryItemProfileMeta(sceneItem.profileMeta, sceneGenerationDraft, undefined, false, assembledPrompt);
      const persistedItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            profileMeta: persistedProfileMeta,
          }),
        }),
      );

      setSceneItems((current) => current.map((item) => (item.id === persistedItem.id ? persistedItem : item)));

      const result = await parseJsonResponse<{
        taskId: string;
        status: string;
        assetId?: string | null;
        asset?: LibraryAssetRecord;
      }>(
        await fetch(`/api/library-items/${selectedItem.id}/generate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            itemKind: "scene",
            mode: sceneGenerationDraft.mode,
            instructionPresetId: sceneGenerationDraft.instructionPresetId || undefined,
            prompt: sceneGenerationDraft.prompt.trim() || undefined,
            referenceAssetIds: sceneGenerationDraft.referenceAssetIds,
            assembledPrompt,
            requestId: `library-item-generate-${crypto.randomUUID()}`,
          }),
        }),
      );

      if (result.asset) {
        const generatedAsset = result.asset;

        setLatestGeneratedSceneAsset(generatedAsset);
        setSceneAssets((current) => {
          const exists = current.some((asset) => asset.id === generatedAsset.id);

          return exists ? current : [...current, generatedAsset];
        });
        setSceneItems((current) =>
          current.map((item) =>
            item.id === selectedItem.id
              ? {
                  ...item,
                  coverAssetId: generatedAsset.id,
                  coverAssetUrl: generatedAsset.fileUrl,
                  profileMeta: persistedProfileMeta,
                  updatedAt: new Date(),
                }
              : item,
          ),
        );
        setScenePreviewUrls((current) => ({
          ...current,
          [selectedItem.id]: generatedAsset.fileUrl,
        }));
      }

      toast.success(sceneGenerationDraft.mode === "image_to_image" ? "场景图生图已完成。" : "场景文生图已完成。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景图片生成失败。");
    } finally {
      setIsGeneratingSceneImage(false);
    }
  }

  async function handleDeleteSubjectAsset(assetId: string) {
    if (activeSection !== "subject" || !selectedItem) {
      return;
    }

    const subjectItem = selectedItem as LibraryItemRecord;
    const nextSubjectAssets = subjectAssets.filter((asset) => asset.id !== assetId);
    const nextCoverAssetId =
      subjectItem.coverAssetId === assetId ? (nextSubjectAssets[0]?.id ?? null) : (subjectItem.coverAssetId ?? null);
    const nextCoverAssetUrl =
      nextCoverAssetId ? nextSubjectAssets.find((asset) => asset.id === nextCoverAssetId)?.fileUrl ?? null : null;
    const nextGenerationDraft = {
      ...subjectGenerationDraft,
      referenceAssetIds: subjectGenerationDraft.referenceAssetIds.filter((id) => id !== assetId),
    };
    const persistedProfileMeta = buildLibraryItemProfileMeta(
      subjectItem.profileMeta,
      nextGenerationDraft,
      modelProfileDraft,
      isModelEntityType(subjectItem.entityType),
      buildGenerationPromptPreview({
        item: subjectItem,
        preset: instructionItems.find((preset) => preset.id === nextGenerationDraft.instructionPresetId) ?? null,
        prompt: nextGenerationDraft.prompt,
      }),
    );

    setDeletingSubjectAssetId(assetId);

    try {
      await parseJsonResponse<LibraryAssetRecord>(
        await fetch(`/api/library-items/${selectedItem.id}/assets/${assetId}`, {
          method: "DELETE",
          headers: {
            "x-workspace-id": workspaceId,
          },
        }),
      );

      const updatedItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            coverAssetId: nextCoverAssetId,
            profileMeta: persistedProfileMeta,
          }),
        }),
      );

      setSubjectAssets(nextSubjectAssets);
      setSubjectGenerationDraft(nextGenerationDraft);
      setSubjectItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setSubjectPreviewUrls((current) => {
        const next = { ...current };

        if (nextCoverAssetUrl) {
          next[selectedItem.id] = nextCoverAssetUrl;
        } else {
          delete next[selectedItem.id];
        }

        return next;
      });

      if (latestGeneratedSubjectAsset?.id === assetId) {
        setLatestGeneratedSubjectAsset(nextSubjectAssets.at(-1) ?? null);
      }

      if (previewAsset?.fileUrl && subjectAssets.some((asset) => asset.id === assetId && asset.fileUrl === previewAsset.fileUrl)) {
        setPreviewAsset(null);
      }

      toast.success("主体图片已删除。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主体图片删除失败。");
    } finally {
      setDeletingSubjectAssetId(null);
    }
  }

  async function handleDeleteSceneAsset(assetId: string) {
    if (activeSection !== "scene" || !selectedItem) {
      return;
    }

    const sceneItem = selectedItem as LibraryItemRecord;
    const nextSceneAssets = sceneAssets.filter((asset) => asset.id !== assetId);
    const nextCoverAssetId =
      sceneItem.coverAssetId === assetId ? (nextSceneAssets[0]?.id ?? null) : (sceneItem.coverAssetId ?? null);
    const nextCoverAssetUrl =
      nextCoverAssetId ? nextSceneAssets.find((asset) => asset.id === nextCoverAssetId)?.fileUrl ?? null : null;
    const nextGenerationDraft = {
      ...sceneGenerationDraft,
      referenceAssetIds: sceneGenerationDraft.referenceAssetIds.filter((id) => id !== assetId),
    };
    const persistedProfileMeta = buildLibraryItemProfileMeta(
      sceneItem.profileMeta,
      nextGenerationDraft,
      undefined,
      false,
      buildGenerationPromptPreview({
        item: sceneItem,
        preset: instructionItems.find((preset) => preset.id === nextGenerationDraft.instructionPresetId) ?? null,
        prompt: nextGenerationDraft.prompt,
      }),
    );

    setDeletingSceneAssetId(assetId);

    try {
      await parseJsonResponse<LibraryAssetRecord>(
        await fetch(`/api/library-items/${selectedItem.id}/assets/${assetId}`, {
          method: "DELETE",
          headers: {
            "x-workspace-id": workspaceId,
          },
        }),
      );

      const updatedItem = await parseJsonResponse<LibraryItemRecord>(
        await fetch(`/api/library-items/${selectedItem.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            workspaceId,
            coverAssetId: nextCoverAssetId,
            profileMeta: persistedProfileMeta,
          }),
        }),
      );

      setSceneAssets(nextSceneAssets);
      setSceneGenerationDraft(nextGenerationDraft);
      setSceneItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setScenePreviewUrls((current) => {
        const next = { ...current };

        if (nextCoverAssetUrl) {
          next[selectedItem.id] = nextCoverAssetUrl;
        } else {
          delete next[selectedItem.id];
        }

        return next;
      });

      if (latestGeneratedSceneAsset?.id === assetId) {
        setLatestGeneratedSceneAsset(nextSceneAssets.at(-1) ?? null);
      }

      if (previewAsset?.fileUrl && sceneAssets.some((asset) => asset.id === assetId && asset.fileUrl === previewAsset.fileUrl)) {
        setPreviewAsset(null);
      }

      toast.success("场景图片已删除。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景图片删除失败。");
    } finally {
      setDeletingSceneAssetId(null);
    }
  }

  async function handleDelete() {
    if (!selectedItem) {
      return;
    }

    const confirmMessage =
      activeSection === "instruction"
        ? `确认删除指令“${selectedItem.name}”吗？`
        : `确认删除${activeSection === "subject" ? "主体" : "场景"}“${selectedItem.name}”吗？`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);

    try {
      if (activeSection === "instruction") {
        await parseJsonResponse<InstructionPresetRecord>(
          await fetch(`/api/instruction-presets/${selectedItem.id}`, {
            method: "DELETE",
            headers: {
              "x-workspace-id": workspaceId,
            },
          }),
        );
        setInstructionItems((current) => current.filter((item) => item.id !== selectedItem.id));
        setSelectedId(null);
        setIsDetailModalOpen(false);
        toast.success("指令已删除。");
      } else {
        await parseJsonResponse<LibraryItemRecord>(
          await fetch(`/api/library-items/${selectedItem.id}`, {
            method: "DELETE",
            headers: {
              "x-workspace-id": workspaceId,
            },
          }),
        );

        if (activeSection === "subject") {
          setSubjectItems((current) => current.filter((item) => item.id !== selectedItem.id));
          setSelectedId(null);
          setIsDetailModalOpen(false);
          toast.success("主体已删除。");
        } else {
          setSceneItems((current) => current.filter((item) => item.id !== selectedItem.id));
          setSelectedId(null);
          setIsDetailModalOpen(false);
          toast.success("场景已删除。");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSave() {
    if (!canEdit) {
      return;
    }

    if (activeSection === "instruction") {
      await updateInstructionPreset();

      return;
    }

    await updateLibraryItem();
  }

  async function handleCreateSubmit() {
    if (!canEdit) {
      return;
    }

    if (activeSection === "instruction") {
      await createInstructionPreset();

      return;
    }

    await createLibraryItem();
  }

  const selectedLabel =
    selectedItem?.name ?? (activeSection === "instruction" ? "选择一条指令" : "选择一条资源");

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px]">
        <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_12px_36px_-28px_rgba(15,23,42,0.16)]">
          <div className="border-b border-black/5 bg-[#fcfcfd] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-[#ff5f57]" />
                  <span className="size-3 rounded-full bg-[#febc2e]" />
                  <span className="size-3 rounded-full bg-[#28c840]" />
                  <div className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-foreground">
                      Libraries
                    </span>
                    <span className="hidden sm:inline">{workspaceName}</span>
                    <span className="hidden rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs sm:inline">
                      {roleLabel[workspaceRole as keyof typeof roleLabel] ?? workspaceRole}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">资源库</h1>
                  <p className="text-sm text-muted-foreground">主体、场景、指令</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                  href={`/dashboard?workspaceId=${workspaceId}`}
                >
                  返回工作台
                </Link>
                <Link
                  className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  href={`/canvases?workspaceId=${workspaceId}`}
                >
                  进入画布
                </Link>
                {isTeamWorkspace ? (
                  <Link
                    className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                    href={`/workspaces/${workspaceId}/members`}
                  >
                    {canManageMembers ? "成员与共享" : "查看成员权限"}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid min-h-[760px] lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-black/5 bg-[#fafafb] p-4 lg:border-r lg:border-b-0">
              <div className="space-y-2">
                <div className="space-y-2">
                  {(Object.keys(sectionMeta) as SectionKey[]).map((sectionKey) => {
                    const section = sectionMeta[sectionKey];
                    const Icon = section.icon;
                    const isActive = activeSection === sectionKey;

                    return (
                      <button
                        key={sectionKey}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                          isActive
                            ? "border-black/8 bg-white shadow-[0_6px_20px_-18px_rgba(15,23,42,0.2)]"
                            : "border-transparent bg-transparent hover:bg-white/80",
                        )}
                        type="button"
                        onClick={() => switchSection(sectionKey)}
                      >
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br",
                            section.accentClass,
                          )}
                        >
                          <Icon className="size-4 text-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-foreground">{section.title}</p>
                            <span className="text-xs text-muted-foreground">{allCounts[sectionKey]}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-col bg-white">
              <div className="border-b border-black/5 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4">
                  <div className="rounded-[20px] border border-black/5 bg-[#fafafb] px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sharingTitle}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{sharingDescription}</p>
                      </div>
                      {isTeamWorkspace ? (
                        <Link
                          className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-white"
                          href={`/workspaces/${workspaceId}/members`}
                        >
                          {canManageMembers ? "去邀请成员" : "查看成员列表"}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{activeMeta.title}</h2>
                      <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted-foreground">
                        {filteredItems.length} / {currentItems.length}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
                    {activeSection === "subject" ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: "all", label: "全部主体", count: subjectItems.length },
                            { key: "model", label: "模特主体", count: subjectItems.filter((item) => isModelEntityType(item.entityType)).length },
                            { key: "product", label: "商品主体", count: subjectItems.filter((item) => !isModelEntityType(item.entityType)).length },
                          ].map((option) => (
                            <button
                              key={option.key}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs transition",
                                subjectViewMode === option.key
                                  ? "border-black/10 bg-white text-foreground shadow-sm"
                                  : "border-transparent bg-transparent text-muted-foreground hover:border-black/8 hover:bg-white",
                              )}
                              type="button"
                              onClick={() => {
                                setSubjectViewMode(option.key as SubjectViewMode);
                                if (option.key !== "model") {
                                  setSelectedModelTags([]);
                                }
                              }}
                            >
                              {option.label} · {option.count}
                            </button>
                          ))}
                        </div>
                        {subjectViewMode === "model" && availableModelTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {availableModelTags.map((tag) => {
                              const isActive = selectedModelTags.includes(tag);

                              return (
                                <button
                                  key={tag}
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-[11px] transition",
                                    isActive
                                      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                                      : "border-black/8 bg-white text-muted-foreground hover:text-foreground",
                                  )}
                                  type="button"
                                  onClick={() =>
                                    setSelectedModelTags((current) =>
                                      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
                                    )
                                  }
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-[260px] flex-1 sm:w-[320px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-10 rounded-xl border-black/8 bg-[#fafafa] pl-9 shadow-none"
                        placeholder={activeMeta.searchPlaceholder}
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                      />
                    </div>
                    {canEdit && (activeSection === "subject" || activeSection === "scene") ? (
                      <Button type="button" variant="outline" onClick={openBatchImport}>
                        <Upload className="size-4" />
                        批量导入
                      </Button>
                    ) : null}
                  </div>
                </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 bg-[#fcfcfd] p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {canEdit ? (
                      <button
                        className="group w-full rounded-[20px] border border-dashed border-black/10 bg-white p-3.5 text-left transition hover:border-black/20"
                        type="button"
                        onClick={openCreate}
                      >
                        <div className="space-y-2.5">
                          <div className="flex aspect-square items-center justify-center rounded-[16px] bg-[#fafafa]">
                            <div className="flex size-10 items-center justify-center rounded-2xl bg-foreground text-background transition group-hover:scale-105">
                              <Plus className="size-4" />
                            </div>
                          </div>
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground">{activeMeta.createLabel}</p>
                            <p className="text-xs text-muted-foreground">模态框创建</p>
                          </div>
                        </div>
                      </button>
                    ) : null}

                    {filteredItems.length === 0 ? (
                      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[20px] border border-dashed border-black/8 bg-white px-6 text-center md:col-span-2 xl:col-span-3">
                        <p className="font-medium text-foreground">
                          {keyword.trim().length > 0 ? "没有匹配的结果" : activeMeta.emptyTitle}
                        </p>
                        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                          {keyword.trim().length > 0
                            ? "换个关键词，或者清空搜索后继续浏览全部内容。"
                            : activeMeta.emptyDescription}
                        </p>
                      </div>
                    ) : (
                      filteredItems.map((item) => {
                        const isSelected = selectedId === item.id;
                        const itemMetaLabel = "promptTemplate" in item ? item.scope : item.entityType ?? item.kind;
                        const itemPreview = "promptTemplate" in item ? item.promptTemplate : item.promptHints ?? item.description ?? "";
                        const ItemIcon = "promptTemplate" in item ? MessageSquare : ActiveSectionIcon;
                        const previewImageUrl =
                          "promptTemplate" in item
                            ? null
                            : item.coverAssetUrl ??
                              (item.kind === "subject" ? subjectPreviewUrls[item.id] : scenePreviewUrls[item.id]) ??
                              null;
                        const dragPayload =
                          "promptTemplate" in item || !previewImageUrl
                            ? null
                            : JSON.stringify({
                                id: item.id,
                                kind: item.kind,
                              });

                        return (
                          <button
                            key={item.id}
                            draggable={Boolean(dragPayload)}
                            className={cn(
                              "group w-full rounded-[20px] border bg-white p-3.5 text-left transition",
                              isSelected
                                ? "border-black/15 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.18)]"
                                : "border-black/5 hover:border-black/10",
                            )}
                            type="button"
                            onDragStart={(event) => {
                              if (!dragPayload) {
                                return;
                              }

                              event.dataTransfer.setData("application/x-canvas-library-item", dragPayload);
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => openDetail(item.id)}
                          >
                            <div className="space-y-2.5">
                              <div className="relative flex aspect-square items-start justify-between overflow-hidden rounded-[16px] bg-[#fafafa] p-3">
                                {previewImageUrl ? (
                                  <Image
                                    alt={item.name}
                                    className="object-cover"
                                    fill
                                    sizes="220px"
                                    src={previewImageUrl}
                                  />
                                ) : null}
                                <div className="relative z-10 flex size-8 items-center justify-center rounded-xl bg-white/90 text-foreground backdrop-blur">
                                  <ItemIcon className="size-3.5" />
                                </div>
                                <span className="relative z-10 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {itemMetaLabel}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="line-clamp-1 font-medium text-foreground">{item.name}</p>
                                      {"promptTemplate" in item ? null : item.kind === "subject" && isModelEntityType(item.entityType) ? (
                                        <span className="shrink-0 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] text-fuchsia-700">模特</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(item.updatedAt)}</span>
                                </div>
                                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {itemPreview.trim() || "暂无额外说明。"}
                                </p>
                              </div>
                              <div className="flex min-h-4 items-center gap-1.5">
                                {item.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[10px] text-muted-foreground">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                </div>
              </div>
            </section>
          </div>
        </section>

        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-5xl overflow-hidden rounded-[28px] border border-black/5 p-0 sm:max-w-5xl" showCloseButton>
            <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[24px] bg-white">
              <DialogHeader className="px-6 py-5">
                <DialogTitle className="text-lg">
                  {activeSection === "instruction"
                    ? "新建指令"
                    : activeSection === "subject"
                      ? "新建主体"
                      : "新建场景"}
                </DialogTitle>
                <DialogDescription>采用宽屏布局，只填写必要信息。</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-y-auto px-6 pb-6">
                {activeSection === "instruction" ? (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="space-y-2">
                        <Label htmlFor="create-instruction-name">名称</Label>
                        <Input
                          id="create-instruction-name"
                          placeholder="例如：电商棚拍主视觉"
                          value={createInstructionDraft.name}
                          onChange={(event) =>
                            setCreateInstructionDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="create-instruction-scope">作用域</Label>
                        <select
                          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                          id="create-instruction-scope"
                          value={createInstructionDraft.scope}
                          onChange={(event) =>
                            setCreateInstructionDraft((current) => ({
                              ...current,
                              scope: event.target.value as EditableInstructionScope,
                            }))
                          }
                        >
                          <option value="workspace">workspace</option>
                          <option value="personal">personal</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-instruction-prompt">预制 Prompt</Label>
                      <Textarea
                        id="create-instruction-prompt"
                        placeholder="写入可复用的 prompt"
                        rows={12}
                        value={createInstructionDraft.promptTemplate}
                        onChange={(event) =>
                          setCreateInstructionDraft((current) => ({
                            ...current,
                            promptTemplate: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-instruction-negative">负向 Prompt</Label>
                      <Textarea
                        id="create-instruction-negative"
                        placeholder="可选"
                        rows={4}
                        value={createInstructionDraft.negativePrompt}
                        onChange={(event) =>
                          setCreateInstructionDraft((current) => ({
                            ...current,
                            negativePrompt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl bg-[#fafafa] p-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-instruction-tags">标签</Label>
                      <Input
                        id="create-instruction-tags"
                        placeholder="例如：文生图, 商业摄影"
                        value={createInstructionDraft.tags}
                        onChange={(event) =>
                          setCreateInstructionDraft((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-instruction-description">说明</Label>
                      <Textarea
                        id="create-instruction-description"
                        placeholder="简要说明使用场景"
                        rows={8}
                        value={createInstructionDraft.description}
                        onChange={(event) =>
                          setCreateInstructionDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  </div>
                ) : (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="create-library-name">名称</Label>
                        <Input
                          id="create-library-name"
                          placeholder={activeSection === "subject" ? "例如：法式连衣裙主图主体" : "例如：极简奶油风餐桌"}
                          value={createLibraryDraft.name}
                          onChange={(event) =>
                            setCreateLibraryDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="create-library-type">{activeSection === "subject" ? "主体类型" : "场景类型"}</Label>
                        <Input
                          id="create-library-type"
                          placeholder={activeSection === "subject" ? "例如：product" : "例如：studio"}
                          value={createLibraryDraft.entityType}
                          onChange={(event) =>
                            setCreateLibraryDraft((current) => ({
                              ...current,
                              entityType: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-library-description">描述</Label>
                      <Textarea
                        id="create-library-description"
                        placeholder={activeSection === "subject" ? "一句话描述主体" : "一句话描述场景"}
                        rows={10}
                        value={createLibraryDraft.description}
                        onChange={(event) =>
                          setCreateLibraryDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {activeSection === "subject" && isModelEntityType(createLibraryDraft.entityType) ? (
                      <div className="space-y-4 rounded-2xl border border-black/6 bg-white p-4">
                        <div>
                          <p className="font-medium text-foreground">模特资料</p>
                          <p className="mt-1 text-sm text-muted-foreground">这些信息会写入主体库的 `profileMeta`，便于后续筛选和复用。</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>性别</Label>
                            <Input value={createModelProfileDraft.gender} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, gender: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>年龄段</Label>
                            <Input value={createModelProfileDraft.ageRange} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, ageRange: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>妆容风格</Label>
                            <Input value={createModelProfileDraft.makeupStyle} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, makeupStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>发型</Label>
                            <Input value={createModelProfileDraft.hairStyle} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, hairStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>穿搭风格</Label>
                            <Input value={createModelProfileDraft.outfitStyle} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, outfitStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>电商类目</Label>
                            <Input value={createModelProfileDraft.ecommerceCategory} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, ecommerceCategory: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>拍摄质感</Label>
                            <Input value={createModelProfileDraft.shootTexture} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, shootTexture: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>预设类型</Label>
                            <Input value={createModelProfileDraft.presetType} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, presetType: event.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>使用说明</Label>
                          <Textarea rows={4} value={createModelProfileDraft.usageNotes} onChange={(event) => setCreateModelProfileDraft((current) => ({ ...current, usageNotes: event.target.value }))} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4 rounded-2xl bg-[#fafafa] p-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-library-tags">标签</Label>
                      <Input
                        id="create-library-tags"
                        placeholder="例如：电商, 女装"
                        value={createLibraryDraft.tags}
                        onChange={(event) =>
                          setCreateLibraryDraft((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="rounded-2xl border border-dashed border-black/8 bg-white px-4 py-5 text-sm text-muted-foreground">
                      {activeSection === "subject"
                        ? "创建完成后可继续上传主体图片，并调用指令库做文生图或图生图。"
                        : "创建完成后可继续补充场景细节与提示词锚点。"}
                    </div>
                  </div>
                  </div>
                )}
              </div>

              <DialogFooter className="border-black/5 bg-white">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  取消
                </Button>
                <Button disabled={isSaving} onClick={handleCreateSubmit}>
                  {isSaving ? "创建中..." : activeMeta.createLabel}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isBatchImportOpen} onOpenChange={setIsBatchImportOpen}>
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-hidden rounded-[28px] border border-black/5 p-0 sm:max-w-3xl" showCloseButton>
            <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[24px] bg-white">
              <DialogHeader className="px-6 py-5">
                <DialogTitle className="text-lg">
                  {activeSection === "subject" ? "批量导入主体" : "批量导入场景"}
                </DialogTitle>
                <DialogDescription>一次选择多张图片，每张图片会自动生成一条资源记录，并汇总显示导入结果。</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 space-y-5 overflow-y-auto px-6 pb-6">
                <input
                  ref={batchImportInputRef}
                  accept="image/*"
                  className="hidden"
                  multiple
                  type="file"
                  onChange={(event) => {
                    setBatchImportResults(null);
                    setBatchImportFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
                  }}
                />

                <div className="rounded-2xl border border-dashed border-black/10 bg-[#fafafa] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">导入图片</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        支持一次导入多张图片，系统会按文件名自动生成资源名称。
                      </p>
                    </div>
                    <Button disabled={isBatchImporting} type="button" variant="outline" onClick={() => batchImportInputRef.current?.click()}>
                      <Upload className="size-4" />
                      选择图片
                    </Button>
                  </div>
                  <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-muted-foreground">
                    已选择 {batchImportFiles.length} 张图片
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="batch-import-entity-type">类型</Label>
                    <Input
                      id="batch-import-entity-type"
                      placeholder={activeSection === "subject" ? "例如：product / model" : "例如：studio / outdoor"}
                      value={batchImportEntityType}
                      onChange={(event) => setBatchImportEntityType(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="batch-import-tags">统一标签</Label>
                    <Input
                      id="batch-import-tags"
                      placeholder="例如：新品, 电商, 白底"
                      value={batchImportTags}
                      onChange={(event) => setBatchImportTags(event.target.value)}
                    />
                  </div>
                </div>

                {batchImportFiles.length > 0 ? (
                  <div className="space-y-2">
                    <Label>待导入列表</Label>
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-black/8 bg-[#fcfcfd] p-3">
                      {batchImportFiles.map((file) => (
                        <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{getImportItemName(file.name)}</p>
                            <p className="truncate text-xs text-muted-foreground">{file.name}</p>
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{Math.round(file.size / 1024)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {batchImportResults ? (
                  <div className="space-y-2">
                    <Label>导入结果</Label>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-black/8 bg-[#fcfcfd] p-3">
                      {batchImportResults.map((result, index) => (
                        <div
                          key={`${result.fileName}-${index}`}
                          className={cn(
                            "rounded-xl px-3 py-2 text-sm",
                            result.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                          )}
                        >
                          <p className="font-medium">{result.itemName}</p>
                          <p className="mt-1 text-xs">{result.fileName}</p>
                          <p className="mt-1 text-xs">{result.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="border-black/5 bg-white">
                <Button variant="outline" onClick={() => setIsBatchImportOpen(false)}>
                  关闭
                </Button>
                <Button disabled={isBatchImporting || batchImportFiles.length === 0} onClick={() => void handleBatchImportSubmit()}>
                  {isBatchImporting ? "导入中..." : "开始批量导入"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[28px] border border-black/5 p-0 sm:max-w-6xl" showCloseButton>
            <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[24px] bg-white">
              <DialogHeader className="px-6 py-5">
                <DialogTitle className="text-lg">{selectedLabel}</DialogTitle>
                <DialogDescription>
                  {selectedItem ? `更新于 ${formatDate(selectedItem.updatedAt)}` : "请选择一条资源后查看详情。"}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-y-auto px-6 pb-6">
                {!selectedItem ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">当前没有可展示的详情内容。</div>
                ) : activeSection === "instruction" ? (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="space-y-2">
                        <Label htmlFor="library-instruction-name">名称</Label>
                        <Input
                          disabled={!canEdit}
                          id="library-instruction-name"
                          placeholder="例如：电商棚拍主视觉"
                          value={instructionDraft.name}
                          onChange={(event) =>
                            setInstructionDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="library-instruction-scope">作用域</Label>
                        <select
                          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canEdit}
                          id="library-instruction-scope"
                          value={instructionDraft.scope}
                          onChange={(event) =>
                            setInstructionDraft((current) => ({
                              ...current,
                              scope: event.target.value as EditableInstructionScope,
                            }))
                          }
                        >
                          <option value="workspace">workspace</option>
                          <option value="personal">personal</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="library-instruction-prompt">预制 Prompt</Label>
                      <Textarea
                        disabled={!canEdit}
                        id="library-instruction-prompt"
                        placeholder="写入可复用的 prompt"
                        rows={14}
                        value={instructionDraft.promptTemplate}
                        onChange={(event) =>
                          setInstructionDraft((current) => ({
                            ...current,
                            promptTemplate: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="library-instruction-negative">负向 Prompt</Label>
                      <Textarea
                        disabled={!canEdit}
                        id="library-instruction-negative"
                        placeholder="可选"
                        rows={5}
                        value={instructionDraft.negativePrompt}
                        onChange={(event) =>
                          setInstructionDraft((current) => ({
                            ...current,
                            negativePrompt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl bg-[#fafafa] p-4">
                    <div className="space-y-2">
                      <Label htmlFor="library-instruction-tags">标签</Label>
                      <Input
                        disabled={!canEdit}
                        id="library-instruction-tags"
                        placeholder="例如：文生图, 商业摄影"
                        value={instructionDraft.tags}
                        onChange={(event) =>
                          setInstructionDraft((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="library-instruction-description">说明</Label>
                      <Textarea
                        disabled={!canEdit}
                        id="library-instruction-description"
                        placeholder="描述这条指令的适用场景"
                        rows={8}
                        value={instructionDraft.description}
                        onChange={(event) =>
                          setInstructionDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  </div>
                ) : (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="library-item-name">名称</Label>
                        <Input
                          disabled={!canEdit}
                          id="library-item-name"
                          placeholder={activeSection === "subject" ? "例如：法式连衣裙主图主体" : "例如：极简奶油风餐桌"}
                          value={libraryDraft.name}
                          onChange={(event) =>
                            setLibraryDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="library-item-type">{activeSection === "subject" ? "主体类型" : "场景类型"}</Label>
                        <Input
                          disabled={!canEdit}
                          id="library-item-type"
                          placeholder={activeSection === "subject" ? "例如：product" : "例如：studio"}
                          value={libraryDraft.entityType}
                          onChange={(event) =>
                            setLibraryDraft((current) => ({
                              ...current,
                              entityType: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="library-item-description">描述</Label>
                      <Textarea
                        disabled={!canEdit}
                        id="library-item-description"
                        placeholder={activeSection === "subject" ? "一句话描述主体" : "一句话描述场景"}
                        rows={8}
                        value={libraryDraft.description}
                        onChange={(event) =>
                          setLibraryDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="library-item-prompt-hints">提示词锚点</Label>
                      <Textarea
                        disabled={!canEdit}
                        id="library-item-prompt-hints"
                        placeholder="可选"
                        rows={8}
                        value={libraryDraft.promptHints}
                        onChange={(event) =>
                          setLibraryDraft((current) => ({
                            ...current,
                            promptHints: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {activeSection === "subject" && isSelectedSubjectModel ? (
                      <div className="space-y-4 rounded-2xl border border-black/6 bg-white p-4">
                        <div>
                          <p className="font-medium text-foreground">模特资料</p>
                          <p className="mt-1 text-sm text-muted-foreground">用于筛选模特主体，并作为后续画布引用时的识别信息。</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>性别</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.gender} onChange={(event) => setModelProfileDraft((current) => ({ ...current, gender: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>年龄段</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.ageRange} onChange={(event) => setModelProfileDraft((current) => ({ ...current, ageRange: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>妆容风格</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.makeupStyle} onChange={(event) => setModelProfileDraft((current) => ({ ...current, makeupStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>发型</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.hairStyle} onChange={(event) => setModelProfileDraft((current) => ({ ...current, hairStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>穿搭风格</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.outfitStyle} onChange={(event) => setModelProfileDraft((current) => ({ ...current, outfitStyle: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>电商类目</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.ecommerceCategory} onChange={(event) => setModelProfileDraft((current) => ({ ...current, ecommerceCategory: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>拍摄质感</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.shootTexture} onChange={(event) => setModelProfileDraft((current) => ({ ...current, shootTexture: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>预设类型</Label>
                            <Input disabled={!canEdit} value={modelProfileDraft.presetType} onChange={(event) => setModelProfileDraft((current) => ({ ...current, presetType: event.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>使用说明</Label>
                          <Textarea disabled={!canEdit} rows={4} value={modelProfileDraft.usageNotes} onChange={(event) => setModelProfileDraft((current) => ({ ...current, usageNotes: event.target.value }))} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4 rounded-2xl bg-[#fafafa] p-4">
                    <div className="space-y-2">
                      <Label htmlFor="library-item-tags">标签</Label>
                      <Input
                        disabled={!canEdit}
                        id="library-item-tags"
                        placeholder="例如：电商, 女装"
                        value={libraryDraft.tags}
                        onChange={(event) =>
                          setLibraryDraft((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {activeSection === "subject" ? (
                      <div className="space-y-4 rounded-2xl border border-black/6 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">主体出图</p>
                          <p className="text-sm text-muted-foreground">支持文生图、图生图、上传图片和调用指令库预制提示词。</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            ref={subjectImageInputRef}
                            accept="image/*"
                            className="hidden"
                            multiple
                            type="file"
                            onChange={(event) => {
                              void handleUploadSubjectImages(event.target.files);
                            }}
                          />
                          <Button
                            disabled={!canEdit || isUploadingSubjectImages}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => subjectImageInputRef.current?.click()}
                          >
                            <Upload className="size-4" />
                            {isUploadingSubjectImages ? "上传中..." : "上传图片"}
                          </Button>
                          <Button
                            disabled={isGeneratingSubjectImage}
                            size="sm"
                            type="button"
                            onClick={() => {
                              void handleGenerateSubjectImage();
                            }}
                          >
                            <WandSparkles className="size-4" />
                            {isGeneratingSubjectImage ? "生成中..." : subjectGenerationDraft.mode === "image_to_image" ? "图生图" : "文生图"}
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className={cn(
                            "rounded-full px-3 py-1 text-sm transition",
                            subjectGenerationDraft.mode === "text_to_image"
                              ? "bg-foreground text-background"
                              : "bg-white text-muted-foreground",
                          )}
                          type="button"
                          onClick={() =>
                            setSubjectGenerationDraft((current) => ({
                              ...current,
                              mode: "text_to_image",
                            }))
                          }
                        >
                          文生图
                        </button>
                        <button
                          className={cn(
                            "rounded-full px-3 py-1 text-sm transition",
                            subjectGenerationDraft.mode === "image_to_image"
                              ? "bg-foreground text-background"
                              : "bg-white text-muted-foreground",
                          )}
                          type="button"
                          onClick={() =>
                            setSubjectGenerationDraft((current) => ({
                              ...current,
                              mode: "image_to_image",
                              referenceAssetIds:
                                current.referenceAssetIds.length > 0 ? current.referenceAssetIds : subjectAssets.slice(0, 1).map((asset) => asset.id),
                            }))
                          }
                        >
                          图生图
                        </button>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="subject-generation-preset">预制指令</Label>
                        <select
                          className="flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring"
                          id="subject-generation-preset"
                          value={subjectGenerationDraft.instructionPresetId}
                          onChange={(event) =>
                            setSubjectGenerationDraft((current) => ({
                              ...current,
                              instructionPresetId: event.target.value,
                            }))
                          }
                        >
                          <option value="">不使用预制指令</option>
                          {instructionItems.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="subject-generation-prompt">补充提示词</Label>
                        <Textarea
                          id="subject-generation-prompt"
                          placeholder="补充你希望强调的主体细节、构图或风格"
                          rows={3}
                          value={subjectGenerationDraft.prompt}
                          onChange={(event) =>
                            setSubjectGenerationDraft((current) => ({
                              ...current,
                              prompt: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>最终提示词</Label>
                          <span className="text-xs text-muted-foreground">实际发送给模型</span>
                        </div>
                        <div className="max-h-52 overflow-y-auto rounded-xl border border-black/8 bg-white px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                            {subjectPromptPreview || "选择预制指令或填写补充提示词后，这里会显示最终组装结果。"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>主体图片</Label>
                          <span className="text-xs text-muted-foreground">
                            {isLoadingSubjectAssets ? "加载中..." : `${subjectAssets.length} 张`}
                          </span>
                        </div>

                        <div className="rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                              <span>
                                火山项目：
                                {(selectedItem as LibraryItemRecord).volcengineSync?.volcengine_project_name ?? "未绑定"}
                              </span>
                              <span>
                                素材组：
                                {(selectedItem as LibraryItemRecord).volcengineSync?.volcengine_asset_group_id ?? "未创建"}
                              </span>
                            </div>
                            <Button
                              className="h-7 rounded-full px-3 text-[11px]"
                              disabled={isSyncingAllSubjectAssets || subjectAssets.length === 0}
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => void handleSyncSubjectAssets()}
                            >
                              <RefreshCw className={cn("mr-1.5 size-3.5", isSyncingAllSubjectAssets && "animate-spin")} />
                              {isSyncingAllSubjectAssets ? "同步中..." : "同步全部到火山"}
                            </Button>
                          </div>
                        </div>

                        {subjectAssets.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {subjectAssets.map((asset) => {
                              const isSelectedReference = subjectGenerationDraft.referenceAssetIds.includes(asset.id);
                              const isSyncingCurrentAsset = syncingSubjectAssetIds.includes(asset.id);
                              const assetSyncStatus = asset.volcengineSync?.sync_status;
                              const canSyncSingleAsset = assetSyncStatus !== "active";

                              return (
                                <div
                                  key={asset.id}
                                  className={cn(
                                    "relative overflow-hidden rounded-xl border bg-white text-left transition",
                                    isSelectedReference ? "border-foreground" : "border-black/8",
                                  )}
                                >
                                  <button
                                    aria-label={`删除${asset.fileName}`}
                                    className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-black/80"
                                    disabled={deletingSubjectAssetId === asset.id}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteSubjectAsset(asset.id);
                                    }}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                  <button
                                    className="block w-full"
                                    type="button"
                                    onClick={() =>
                                      setPreviewAsset({
                                        title: "主体图片预览",
                                        fileName: asset.fileName,
                                        fileUrl: asset.fileUrl,
                                      })
                                    }
                                  >
                                    <div className="relative aspect-square w-full">
                                      <Image alt={asset.fileName} className="object-cover" fill sizes="160px" src={asset.fileUrl} />
                                    </div>
                                  </button>
                                  <div className="space-y-1.5 border-t border-black/6 p-1.5">
                                    <button
                                      className={cn(
                                        "w-full rounded-lg px-2 py-1.5 text-xs transition",
                                        isSelectedReference
                                          ? "bg-foreground text-background"
                                          : "bg-[#f5f5f7] text-muted-foreground",
                                      )}
                                      type="button"
                                      onClick={() =>
                                        setSubjectGenerationDraft((current) => ({
                                          ...current,
                                          referenceAssetIds: current.referenceAssetIds.includes(asset.id)
                                            ? current.referenceAssetIds.filter((id) => id !== asset.id)
                                            : [...current.referenceAssetIds, asset.id],
                                        }))
                                      }
                                    >
                                      {isSelectedReference ? "已选参考" : "设为参考"}
                                    </button>
                                    <div className="space-y-1 rounded-lg bg-[#f7f7f8] px-2 py-1.5 text-[11px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span
                                          className={cn(
                                            "rounded-full px-1.5 py-0.5 font-medium",
                                            getVolcengineSyncStatusClass(asset.volcengineSync?.sync_status),
                                          )}
                                        >
                                          {formatVolcengineSyncStatus(asset.volcengineSync?.sync_status)}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {formatOptionalDate(asset.volcengineSync?.last_synced_at)}
                                        </span>
                                      </div>
                                      <p
                                        className={cn(
                                          "break-all leading-4",
                                          asset.volcengineSync?.last_sync_error ? "text-rose-700" : "text-muted-foreground",
                                        )}
                                      >
                                        {buildVolcengineSyncHint(asset.volcengineSync)}
                                      </p>
                                      {canSyncSingleAsset ? (
                                        <Button
                                          className="h-7 w-full rounded-md text-[11px]"
                                          disabled={isSyncingCurrentAsset || isSyncingAllSubjectAssets}
                                          size="sm"
                                          type="button"
                                          variant="secondary"
                                          onClick={() => void handleSyncSubjectAssets([asset.id])}
                                        >
                                          <RefreshCw className={cn("mr-1.5 size-3.5", isSyncingCurrentAsset && "animate-spin")} />
                                          {isSyncingCurrentAsset
                                            ? "同步中..."
                                            : assetSyncStatus === "failed"
                                              ? "重试火山同步"
                                              : assetSyncStatus === "processing"
                                                ? "检查火山状态"
                                                : "同步到火山"}
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-black/10 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
                            先上传主体图片，再做图生图。
                          </div>
                        )}
                      </div>

                      {latestGeneratedSubjectAsset ? (
                        <div className="space-y-2">
                          <Label>最新结果</Label>
                          <div className="overflow-hidden rounded-2xl border border-black/8 bg-white">
                            <button
                              className="relative block aspect-[4/3] w-full"
                              type="button"
                              onClick={() =>
                                setPreviewAsset({
                                  title: "主体最新结果",
                                  fileName: latestGeneratedSubjectAsset.fileName,
                                  fileUrl: latestGeneratedSubjectAsset.fileUrl,
                                })
                              }
                            >
                              <Image
                                alt={latestGeneratedSubjectAsset.fileName}
                                className="object-cover"
                                fill
                                sizes="600px"
                                src={latestGeneratedSubjectAsset.fileUrl}
                              />
                            </button>
                          </div>
                        </div>
                      ) : null}
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-2xl border border-black/6 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground">场景出图</p>
                            <p className="text-sm text-muted-foreground">支持文生图、图生图、上传图片和调用指令库预制提示词。</p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              ref={sceneImageInputRef}
                              accept="image/*"
                              className="hidden"
                              multiple
                              type="file"
                              onChange={(event) => {
                                void handleUploadSceneImages(event.target.files);
                              }}
                            />
                            <Button
                              disabled={!canEdit || isUploadingSceneImages}
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => sceneImageInputRef.current?.click()}
                            >
                              <Upload className="size-4" />
                              {isUploadingSceneImages ? "上传中..." : "上传图片"}
                            </Button>
                            <Button
                              disabled={isGeneratingSceneImage}
                              size="sm"
                              type="button"
                              onClick={() => {
                                void handleGenerateSceneImage();
                              }}
                            >
                              <WandSparkles className="size-4" />
                              {isGeneratingSceneImage ? "生成中..." : sceneGenerationDraft.mode === "image_to_image" ? "图生图" : "文生图"}
                            </Button>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            className={cn(
                              "rounded-full px-3 py-1 text-sm transition",
                              sceneGenerationDraft.mode === "text_to_image"
                                ? "bg-foreground text-background"
                                : "bg-white text-muted-foreground",
                            )}
                            type="button"
                            onClick={() =>
                              setSceneGenerationDraft((current) => ({
                                ...current,
                                mode: "text_to_image",
                              }))
                            }
                          >
                            文生图
                          </button>
                          <button
                            className={cn(
                              "rounded-full px-3 py-1 text-sm transition",
                              sceneGenerationDraft.mode === "image_to_image"
                                ? "bg-foreground text-background"
                                : "bg-white text-muted-foreground",
                            )}
                            type="button"
                            onClick={() =>
                              setSceneGenerationDraft((current) => ({
                                ...current,
                                mode: "image_to_image",
                                referenceAssetIds:
                                  current.referenceAssetIds.length > 0 ? current.referenceAssetIds : sceneAssets.slice(0, 1).map((asset) => asset.id),
                              }))
                            }
                          >
                            图生图
                          </button>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scene-generation-preset">预制指令</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring"
                            id="scene-generation-preset"
                            value={sceneGenerationDraft.instructionPresetId}
                            onChange={(event) =>
                              setSceneGenerationDraft((current) => ({
                                ...current,
                                instructionPresetId: event.target.value,
                              }))
                            }
                          >
                            <option value="">不使用预制指令</option>
                            {instructionItems.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scene-generation-prompt">补充提示词</Label>
                          <Textarea
                            id="scene-generation-prompt"
                            placeholder="补充你希望强调的空间、光线、材质或氛围"
                            rows={3}
                            value={sceneGenerationDraft.prompt}
                            onChange={(event) =>
                              setSceneGenerationDraft((current) => ({
                                ...current,
                                prompt: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>最终提示词</Label>
                            <span className="text-xs text-muted-foreground">实际发送给模型</span>
                          </div>
                          <div className="max-h-52 overflow-y-auto rounded-xl border border-black/8 bg-white px-4 py-3">
                            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                              {scenePromptPreview || "选择预制指令或填写补充提示词后，这里会显示最终组装结果。"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>场景图片</Label>
                            <span className="text-xs text-muted-foreground">
                              {isLoadingSceneAssets ? "加载中..." : `${sceneAssets.length} 张`}
                            </span>
                          </div>

                          {sceneAssets.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {sceneAssets.map((asset) => {
                                const isSelectedReference = sceneGenerationDraft.referenceAssetIds.includes(asset.id);

                                return (
                                  <div
                                    key={asset.id}
                                    className={cn(
                                      "relative overflow-hidden rounded-xl border bg-white text-left transition",
                                      isSelectedReference ? "border-foreground" : "border-black/8",
                                    )}
                                  >
                                    <button
                                      aria-label={`删除${asset.fileName}`}
                                      className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-black/80"
                                      disabled={deletingSceneAssetId === asset.id}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDeleteSceneAsset(asset.id);
                                      }}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                    <button
                                      className="block w-full"
                                      type="button"
                                      onClick={() =>
                                        setPreviewAsset({
                                          title: "场景图片预览",
                                          fileName: asset.fileName,
                                          fileUrl: asset.fileUrl,
                                        })
                                      }
                                    >
                                      <div className="relative aspect-square w-full">
                                        <Image alt={asset.fileName} className="object-cover" fill sizes="160px" src={asset.fileUrl} />
                                      </div>
                                    </button>
                                    <div className="border-t border-black/6 p-1.5">
                                      <button
                                        className={cn(
                                          "w-full rounded-lg px-2 py-1.5 text-xs transition",
                                          isSelectedReference
                                            ? "bg-foreground text-background"
                                            : "bg-[#f5f5f7] text-muted-foreground",
                                        )}
                                        type="button"
                                        onClick={() =>
                                          setSceneGenerationDraft((current) => ({
                                            ...current,
                                            referenceAssetIds: current.referenceAssetIds.includes(asset.id)
                                              ? current.referenceAssetIds.filter((id) => id !== asset.id)
                                              : [...current.referenceAssetIds, asset.id],
                                          }))
                                        }
                                      >
                                        {isSelectedReference ? "已选参考" : "设为参考"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-black/10 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
                              先上传场景图片，再做图生图。
                            </div>
                          )}
                        </div>

                        {latestGeneratedSceneAsset ? (
                          <div className="space-y-2">
                            <Label>最新结果</Label>
                            <div className="overflow-hidden rounded-2xl border border-black/8 bg-white">
                              <button
                                className="relative block aspect-[4/3] w-full"
                                type="button"
                                onClick={() =>
                                  setPreviewAsset({
                                    title: "场景最新结果",
                                    fileName: latestGeneratedSceneAsset.fileName,
                                    fileUrl: latestGeneratedSceneAsset.fileUrl,
                                  })
                                }
                              >
                                <Image
                                  alt={latestGeneratedSceneAsset.fileName}
                                  className="object-cover"
                                  fill
                                  sizes="600px"
                                  src={latestGeneratedSceneAsset.fileUrl}
                                />
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  </div>
                )}
              </div>

              {selectedItem ? (
                <DialogFooter className="border-black/5 bg-white">
                  {canEdit ? (
                    <Button disabled={isDeleting || isSaving} variant="destructive" onClick={handleDelete}>
                      <Trash2 />
                      删除
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                    关闭
                  </Button>
                  {canEdit ? (
                    <Button disabled={isSaving || isDeleting} onClick={handleSave}>
                      {isSaving ? "保存中..." : "保存修改"}
                    </Button>
                  ) : null}
                </DialogFooter>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(previewAsset)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewAsset(null);
            }
          }}
        >
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[28px] border border-black/5 p-0 sm:max-w-6xl" showCloseButton>
            <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[24px] bg-white">
              <DialogHeader className="px-6 py-5">
                <DialogTitle className="text-lg">{previewAsset?.title ?? "图片预览"}</DialogTitle>
                <DialogDescription>{previewAsset?.fileName ?? "点击图片查看放大预览。"}</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-auto px-6 pb-6">
                {previewAsset ? (
                  <div className="overflow-hidden rounded-[24px] border border-black/8 bg-[#f7f7f8]">
                    <div className="relative aspect-[16/10] min-h-[360px] w-full">
                      <Image alt={previewAsset.fileName} className="object-contain" fill sizes="1200px" src={previewAsset.fileUrl} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
