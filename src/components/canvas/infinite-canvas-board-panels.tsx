"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioLines, ChevronLeft, ChevronRight, Clapperboard, Download, Expand, ExternalLink, ImageIcon, Sparkles, Type, Upload, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelCanvasCombinationPlan,
  createCanvasCombinationPlan,
  fetchCanvasInputNodeItems,
  pauseCanvasCombinationPlan,
  patchCanvasNode,
  previewCanvasCombinationPlan,
  reorderCanvasInputNodeItems,
  resumeCanvasCombinationPlan,
  runCanvasCombinationPlan,
  saveCanvasInputNodeItems,
  setCanvasInputNodeItemEnabled,
  type CanvasCombinationPlanApiDetail,
  type CanvasCombinationPlanPreview,
  type CanvasInputNodeItem,
} from "@/components/canvas/infinite-canvas-board.api";

import {
  formatCanvasDateTime,
  getCombinationPlanDetail,
  getInputNodeOutputSummary,
  DEFAULT_STORYBOARD_NODE_SETTINGS,
  DEFAULT_VIDEO_NODE_SETTINGS,
  DEFAULT_INPUT_NODE_SETTINGS,
  DEFAULT_COMBINATION_NODE_SETTINGS,
  clampNumber,
  formatBatchRunBindingSummary,
  getCanvasBatchRunTitle,
  getPrimaryBatchRunResultIndex,
  inferImageExtension,
  isSeedanceVideoModelKey,
  getStoryboardShotAssetNames,
  type CanvasInputNodeSettings,
  type CanvasCombinationNodeSettings,
  type CanvasInputSourceType,
  type CanvasBatchRunDetail,
  type CanvasBatchRunResultIndex,
  type CanvasBatchRunSummary,
  type CanvasBatchRunCombinationItem,
  type CanvasBatchRunResult,
  type CanvasNode,
  type CanvasNodeReferenceAsset,
  type InstructionPresetOption,
  type LibraryItemOption,
  type StoryboardShot,
  type StoryboardNodeSettings,
  type VideoGenerationMode,
  type VideoNodeSettings,
} from "@/components/canvas/infinite-canvas-board.shared";

const VIDEO_MODEL_PRESET_OPTIONS = [
  {
    value: "",
    label: "默认模型",
  },
  {
    value: "seedance-2.0",
    label: "Seedance 2.0",
  },
  {
    value: "kling-v3-omni-pro",
    label: "Kling V3 Omni Pro",
  },
  {
    value: "kling-v3-omni-std",
    label: "Kling V3 Omni Standard",
  },
  {
    value: "kling-v3-std",
    label: "Kling V3 Standard",
  },
] as const;

function getVideoAspectRatioLabel(aspectRatio: number | null) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }

  const presets = [
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
    { label: "1:1", value: 1 },
  ];
  const matchedPreset = presets.find((preset) => Math.abs(preset.value - aspectRatio) < 0.08);

  if (matchedPreset) {
    return matchedPreset.label;
  }

  if (aspectRatio >= 1) {
    return `${aspectRatio.toFixed(2)}:1`;
  }

  return `1:${(1 / aspectRatio).toFixed(2)}`;
}

const PROMPT_ASSET_MENTION_REGEX = /@\[([^\]]+)\]\{asset:([0-9a-f-]+)\}/gi;

function getPromptAssetMentions(prompt: string) {
  const mentions: Array<{ label: string; assetId: string }> = [];

  for (const match of prompt.matchAll(PROMPT_ASSET_MENTION_REGEX)) {
    const label = match[1]?.trim();
    const assetId = match[2]?.trim();

    if (!label || !assetId) {
      continue;
    }

    if (!mentions.some((item) => item.assetId === assetId)) {
      mentions.push({ label, assetId });
    }
  }

  return mentions;
}

type PromptAssetTextareaProps = {
  value: string;
  placeholder: string;
  linkedAssets: CanvasNodeReferenceAsset[];
  contextAssets?: CanvasNodeReferenceAsset[];
  onChange: (value: string) => void;
  onLinkAsset: (asset: CanvasNodeReferenceAsset) => void;
  onUnlinkAsset?: (assetId: string) => void;
  onPreviewAsset?: (asset: CanvasNodeReferenceAsset) => void;
  minHeightClassName?: string;
};

function PromptAssetTextarea({
  value,
  placeholder,
  linkedAssets,
  contextAssets = [],
  onChange,
  onLinkAsset,
  onUnlinkAsset,
  onPreviewAsset,
  minHeightClassName = "min-h-28",
}: PromptAssetTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caretIndex, setCaretIndex] = useState(value.length);
  const promptAssetMentions = useMemo(() => getPromptAssetMentions(value), [value]);
  const promptAssetMentionIds = useMemo(() => new Set(promptAssetMentions.map((item) => item.assetId)), [promptAssetMentions]);
  const availablePromptAssets = useMemo(() => {
    const unique = new Map<string, CanvasNodeReferenceAsset>();

    for (const asset of [...linkedAssets, ...contextAssets]) {
      if (!asset.mimeType.startsWith("image/")) {
        continue;
      }

      if (!unique.has(asset.id)) {
        unique.set(asset.id, asset);
      }
    }

    return Array.from(unique.values());
  }, [contextAssets, linkedAssets]);
  const prefix = value.slice(0, caretIndex);
  const mentionMatch = /(^|\s)@([^\s@]*)$/.exec(prefix);
  const mentionQuery = mentionMatch?.[2]?.trim().toLowerCase() ?? null;
  const promptAssetSuggestions = useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }

    return availablePromptAssets
      .filter((asset) => asset.fileName.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [availablePromptAssets, mentionQuery]);

  const insertPromptAsset = (asset: CanvasNodeReferenceAsset) => {
    const currentTextarea = textareaRef.current;
    const currentCaretIndex = currentTextarea?.selectionStart ?? caretIndex;
    const currentPrefix = value.slice(0, currentCaretIndex);
    const currentMatch = /(^|\s)@([^\s@]*)$/.exec(currentPrefix);

    if (!currentMatch) {
      return;
    }

    const replaceStart = currentCaretIndex - currentMatch[2].length - 1;
    const token = `@[${asset.fileName.replace(/\]/g, "")}]{asset:${asset.id}} `;
    const nextValue = `${value.slice(0, replaceStart)}${token}${value.slice(currentCaretIndex)}`;

    onChange(nextValue);
    onLinkAsset(asset);

    requestAnimationFrame(() => {
      const nextCaretIndex = replaceStart + token.length;

      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
      setCaretIndex(nextCaretIndex);
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        className={`${minHeightClassName} resize-none rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setCaretIndex(event.target.selectionStart ?? event.target.value.length);
          onChange(event.target.value);
        }}
        onClick={(event) => setCaretIndex(event.currentTarget.selectionStart ?? value.length)}
        onKeyUp={(event) => setCaretIndex(event.currentTarget.selectionStart ?? value.length)}
      />

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border bg-background px-2.5 py-1">@ 可引用已关联图片资源</span>
        {promptAssetMentions.map((mention) => {
          const asset = availablePromptAssets.find((item) => item.id === mention.assetId);

          return (
            <span key={mention.assetId} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
              <button
                className="transition hover:opacity-80"
                type="button"
                onClick={() => {
                  if (asset && onPreviewAsset) {
                    onPreviewAsset(asset);
                  }
                }}
              >
                @{asset?.fileName ?? mention.label}
              </button>
              {onUnlinkAsset ? (
                <button
                  aria-label="移除图片引用"
                  className="inline-flex size-4 items-center justify-center rounded-full border border-sky-200 bg-white/70 text-sky-700 transition hover:bg-white"
                  type="button"
                  onClick={() => onUnlinkAsset(mention.assetId)}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      {mentionQuery !== null ? (
        <div className="rounded-2xl border bg-background/90 p-2 shadow-sm">
          {promptAssetSuggestions.length > 0 ? (
            <div className="space-y-1">
              {promptAssetSuggestions.map((asset) => (
                <button
                  key={asset.id}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-muted/50"
                  type="button"
                  onClick={() => insertPromptAsset(asset)}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                    <img alt={asset.fileName} className="h-full w-full object-cover" src={asset.fileUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{asset.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {promptAssetMentionIds.has(asset.id) ? "已在提示词中引用" : "点击插入到当前提示词"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">没有匹配的已关联图片资源。先上传或关联图片后再使用 `@` 引用。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getInputNodeSettings(settingsJson: CanvasNode["settingsJson"]): CanvasInputNodeSettings {
  const sourceType = settingsJson?.sourceType;

  return {
    sourceType: sourceType === "image" || sourceType === "video" || sourceType === "text" ? sourceType : DEFAULT_INPUT_NODE_SETTINGS.sourceType,
    allowMixedSources: Boolean(settingsJson?.allowMixedSources),
  };
}

function getCombinationNodeSettings(settingsJson: CanvasNode["settingsJson"]): CanvasCombinationNodeSettings {
  const mode = settingsJson?.mode;
  const sampleSize =
    typeof settingsJson?.sampleSize === "number" && Number.isFinite(settingsJson.sampleSize)
      ? Math.max(1, Math.min(12, Math.round(settingsJson.sampleSize)))
      : DEFAULT_COMBINATION_NODE_SETTINGS.sampleSize;

  return {
    mode: mode === "cartesian" || mode === "anchor" || mode === "custom_mapping" || mode === "zip" ? mode : DEFAULT_COMBINATION_NODE_SETTINGS.mode,
    anchorInputNodeId: typeof settingsJson?.anchorInputNodeId === "string" ? settingsJson.anchorInputNodeId : null,
    sampleSize,
  };
}

type InputNodePanelProps = {
  selectedNode: CanvasNode;
  workspaceId: string;
  canvasId: string;
  canEdit: boolean;
  subjects: LibraryItemOption[];
  scenes: LibraryItemOption[];
  instructionPresets: InstructionPresetOption[];
  onRefreshRuntime: (fallbackMessage?: string) => Promise<unknown>;
};

export function InputNodePanel({
  selectedNode,
  workspaceId,
  canvasId,
  canEdit,
  subjects,
  scenes,
  instructionPresets,
  onRefreshRuntime,
}: InputNodePanelProps) {
  const apiContext = useMemo(() => ({ workspaceId, canvasId }), [canvasId, workspaceId]);
  const [items, setItems] = useState<CanvasInputNodeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [settings, setSettings] = useState<CanvasInputNodeSettings>(() => getInputNodeSettings(selectedNode.settingsJson));
  const inputSummary = useMemo(() => getInputNodeOutputSummary(selectedNode.outputSnapshot), [selectedNode.outputSnapshot]);

  const assetOptions = useMemo(() => {
    const items = [...subjects, ...scenes];

    return items.flatMap((libraryItem) =>
      (libraryItem.assets ?? [])
        .filter((asset) => {
          if (settings.sourceType === "image") {
            return asset.mimeType.startsWith("image/");
          }

          if (settings.sourceType === "video") {
            return asset.mimeType.startsWith("video/");
          }

          return false;
        })
        .map((asset) => ({
          id: asset.id,
          label: `${libraryItem.name} / ${asset.fileName}`,
          fileName: asset.fileName,
          fileUrl: asset.fileUrl,
          mimeType: asset.mimeType,
          libraryItemId: libraryItem.id,
          libraryItemName: libraryItem.name,
        })),
    );
  }, [scenes, settings.sourceType, subjects]);

  const filteredAssetOptions = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();

    if (!query) {
      return assetOptions.slice(0, 12);
    }

    return assetOptions
      .filter((asset) => asset.label.toLowerCase().includes(query) || asset.fileName.toLowerCase().includes(query))
      .slice(0, 12);
  }, [assetOptions, libraryQuery]);

  useEffect(() => {
    setSettings(getInputNodeSettings(selectedNode.settingsJson));
  }, [selectedNode.id, selectedNode.settingsJson]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void fetchCanvasInputNodeItems(apiContext, selectedNode.id)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "输入源加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiContext, selectedNode.id]);

  const persistItems = async (
    nextItems: Array<{
      source_type: CanvasInputSourceType;
      label: string;
      content_text?: string | null;
      asset_id?: string | null;
      enabled: boolean;
      source_ref?: Record<string, unknown> | null;
    }>,
    successMessage: string,
  ) => {
    setIsSaving(true);

    try {
      const result = await saveCanvasInputNodeItems(
        apiContext,
        selectedNode.id,
        {
          items: nextItems.map((item) => ({
            sourceType: item.source_type,
            displayLabel: item.label,
            contentText: item.content_text ?? null,
            assetId: item.asset_id ?? null,
            enabled: item.enabled,
            sourceRefJson: item.source_ref ?? {},
          })),
        },
        "输入源保存失败。",
      );
      setItems(result.items);
      await onRefreshRuntime("输入源摘要刷新失败。");
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "输入源保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const saveSettings = async (nextSettings: CanvasInputNodeSettings) => {
    setSettings(nextSettings);

    try {
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          settingsJson: nextSettings,
        },
        "输入源配置保存失败。",
      );
      await onRefreshRuntime("输入源状态刷新失败。");
      toast.success("输入源配置已保存。");
    } catch (error) {
      setSettings(getInputNodeSettings(selectedNode.settingsJson));
      toast.error(error instanceof Error ? error.message : "输入源配置保存失败。");
    }
  };

  const addBulkTextItems = async () => {
    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("先输入至少一条文本内容。");
      return;
    }

    await persistItems(
      [
        ...items.map((item) => ({
          source_type: item.source_type,
          label: item.label,
          content_text: item.content_text,
          asset_id: item.asset_id,
          enabled: item.enabled,
          source_ref: item.source_ref,
        })),
        ...lines.map((line) => ({
          source_type: "text" as const,
          label: line.length > 24 ? `${line.slice(0, 24)}...` : line,
          content_text: line,
          enabled: true,
          source_ref: {
            kind: "manual_text",
          },
        })),
      ],
      `已添加 ${lines.length} 条文本输入。`,
    );
    setBulkText("");
  };

  const addPresetItem = async () => {
    const preset = instructionPresets.find((item) => item.id === selectedPresetId);

    if (!preset) {
      toast.error("先选择一条文本资源模板。");
      return;
    }

    await persistItems(
      [
        ...items.map((item) => ({
          source_type: item.source_type,
          label: item.label,
          content_text: item.content_text,
          asset_id: item.asset_id,
          enabled: item.enabled,
          source_ref: item.source_ref,
        })),
        {
          source_type: "text" as const,
          label: preset.name,
          content_text: preset.promptTemplate,
          enabled: true,
          source_ref: {
            kind: "instruction_preset",
            presetId: preset.id,
            presetName: preset.name,
          },
        },
      ],
      "已加入文本资源。",
    );
    setSelectedPresetId("");
  };

  const addAssetItem = async (asset: (typeof filteredAssetOptions)[number]) => {
    await persistItems(
      [
        ...items.map((item) => ({
          source_type: item.source_type,
          label: item.label,
          content_text: item.content_text,
          asset_id: item.asset_id,
          enabled: item.enabled,
          source_ref: item.source_ref,
        })),
        {
          source_type: settings.sourceType,
          label: asset.label,
          asset_id: asset.id,
          enabled: true,
          source_ref: {
            kind: "library_asset",
            libraryItemId: asset.libraryItemId,
            libraryItemName: asset.libraryItemName,
          },
        },
      ],
      `已加入 1 条${settings.sourceType === "image" ? "图片" : "视频"}输入。`,
    );
  };

  const toggleItemEnabled = async (item: CanvasInputNodeItem) => {
    setIsSaving(true);

    try {
      await setCanvasInputNodeItemEnabled(apiContext, selectedNode.id, item.id, {
        enabled: !item.enabled,
      });
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry)));
      await onRefreshRuntime("输入源状态刷新失败。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "输入项更新失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = async (itemId: string) => {
    await persistItems(
      items
        .filter((item) => item.id !== itemId)
        .map((item) => ({
          source_type: item.source_type,
          label: item.label,
          content_text: item.content_text,
          asset_id: item.asset_id,
          enabled: item.enabled,
          source_ref: item.source_ref,
        })),
      "输入项已移除。",
    );
  };

  const moveItem = async (itemId: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(currentIndex, 1);
    nextItems.splice(nextIndex, 0, movedItem);

    setItems(nextItems);
    setIsSaving(true);

    try {
      const result = await reorderCanvasInputNodeItems(
        apiContext,
        selectedNode.id,
        {
          itemIds: nextItems.map((item) => item.id),
        },
        "输入源排序失败。",
      );
      setItems(result.items);
      await onRefreshRuntime("输入源状态刷新失败。");
    } catch (error) {
      setItems(items);
      toast.error(error instanceof Error ? error.message : "输入源排序失败。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="w-full max-w-5xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedNode.title}</p>
              <p className="text-xs text-muted-foreground">输入源节点只负责维护输入集合，不直接生成内容；把它连到组合节点，再由下游生成节点逐条消费。</p>
            </div>
            <div className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
              {inputSummary ? `${inputSummary.enabledItems}/${inputSummary.totalItems} 项启用中` : "等待配置"}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.96fr_1.04fr]">
            <div className="min-w-0 space-y-3 rounded-[22px] border bg-muted/20 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>输入类型</span>
                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                    disabled={!canEdit || isSaving}
                    value={settings.sourceType}
                    onChange={(event) =>
                      void saveSettings({
                        ...settings,
                        sourceType: event.target.value === "image" || event.target.value === "video" ? event.target.value : "text",
                      })
                    }
                  >
                    <option value="text">文本输入</option>
                    <option value="image">图片输入</option>
                    <option value="video">视频输入</option>
                  </select>
                </label>
                <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
                  <span>当前摘要</span>
                  <div
                    className="flex h-10 min-w-0 items-center overflow-hidden rounded-xl border bg-background px-3 text-sm text-foreground"
                    title={inputSummary?.sampleLabels?.length ? inputSummary.sampleLabels.slice(0, 2).join(" / ") : "还没有输入项"}
                  >
                    <span className="block w-full truncate">
                      {inputSummary?.sampleLabels?.length ? inputSummary.sampleLabels.slice(0, 2).join(" / ") : "还没有输入项"}
                    </span>
                  </div>
                </div>
              </div>

              {settings.sourceType === "text" ? (
                <div className="space-y-3">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>批量文本</span>
                    <Textarea
                      className="min-h-28 resize-none rounded-2xl bg-background"
                      disabled={!canEdit || isSaving}
                      placeholder="一行一条输入内容，例如三条标题、三段脚本、三组镜头描述。"
                      value={bulkText}
                      onChange={(event) => setBulkText(event.target.value)}
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <Button disabled={!canEdit || isSaving} size="sm" type="button" onClick={() => void addBulkTextItems()}>
                      添加文本输入
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-2xl border bg-background/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-foreground">从文本资源模板导入</p>
                      <p className="text-[11px] text-muted-foreground">适合把资源库里的指令模板作为批量输入。</p>
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="flex h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                        disabled={!canEdit || isSaving}
                        value={selectedPresetId}
                        onChange={(event) => setSelectedPresetId(event.target.value)}
                      >
                        <option value="">选择文本资源</option>
                        {instructionPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                      <Button disabled={!canEdit || isSaving || !selectedPresetId} size="sm" type="button" variant="outline" onClick={() => void addPresetItem()}>
                        导入
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>从资源库筛选 {settings.sourceType === "image" ? "图片" : "视频"}</span>
                    <Input
                      disabled={!canEdit || isSaving}
                      placeholder={`搜索${settings.sourceType === "image" ? "图片" : "视频"}资源名`}
                      value={libraryQuery}
                      onChange={(event) => setLibraryQuery(event.target.value)}
                    />
                  </label>
                  <div className="grid max-h-72 min-h-0 gap-2 overflow-y-auto rounded-2xl border bg-background/70 p-2 md:grid-cols-2">
                    {filteredAssetOptions.length > 0 ? (
                      filteredAssetOptions.map((asset) => (
                        <button
                          key={asset.id}
                          className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-3 text-left transition hover:border-foreground/20 hover:bg-muted/40"
                          disabled={!canEdit || isSaving}
                          type="button"
                          onClick={() => void addAssetItem(asset)}
                        >
                          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50">
                            {asset.mimeType.startsWith("image/") ? (
                              <img alt={asset.fileName} className="h-full w-full object-cover" src={asset.fileUrl} />
                            ) : (
                              <Video className="size-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{asset.libraryItemName}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{asset.fileName}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
                        资源库里暂时没有匹配的{settings.sourceType === "image" ? "图片" : "视频"}资产。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-3 rounded-[22px] border bg-background/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">输入项</p>
                  <p className="text-xs text-muted-foreground">启用项才会被组合节点纳入预估和实际执行。</p>
                </div>
                <div className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                  {isLoading ? "加载中..." : `${items.length} 项`}
                </div>
              </div>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {items.length > 0 ? (
                  items.map((item, index) => (
                    <div key={item.id} className="rounded-2xl border bg-background px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground">#{index + 1}</span>
                            <span className="rounded-full border bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                              {item.source_type.toUpperCase()}
                            </span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                              {item.enabled ? "启用" : "停用"}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm font-medium">{item.label}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {item.content_text ?? item.asset?.file_name ?? item.asset_id ?? "资源型输入"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button disabled={!canEdit || isSaving || index === 0} size="sm" type="button" variant="outline" onClick={() => void moveItem(item.id, -1)}>
                            上移
                          </Button>
                          <Button
                            disabled={!canEdit || isSaving || index === items.length - 1}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => void moveItem(item.id, 1)}
                          >
                            下移
                          </Button>
                          <Button disabled={!canEdit || isSaving} size="sm" type="button" variant="outline" onClick={() => void toggleItemEnabled(item)}>
                            {item.enabled ? "停用" : "启用"}
                          </Button>
                          <Button disabled={!canEdit || isSaving} size="sm" type="button" variant="outline" onClick={() => void removeItem(item.id)}>
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                    还没有输入项。先在左侧添加文本，或从资源库选择图片/视频。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type CombinationNodePanelProps = {
  selectedNode: CanvasNode;
  workspaceId: string;
  canvasId: string;
  canEdit: boolean;
  onRefreshRuntime: (fallbackMessage?: string) => Promise<unknown>;
};

export function CombinationNodePanel({
  selectedNode,
  workspaceId,
  canvasId,
  canEdit,
  onRefreshRuntime,
}: CombinationNodePanelProps) {
  const apiContext = useMemo(() => ({ workspaceId, canvasId }), [canvasId, workspaceId]);
  const snapshotDetail = useMemo(() => getCombinationPlanDetail(selectedNode.outputSnapshot), [selectedNode.outputSnapshot]);
  const [settings, setSettings] = useState<CanvasCombinationNodeSettings>(() => getCombinationNodeSettings(selectedNode.settingsJson));
  const [preview, setPreview] = useState<CanvasCombinationPlanPreview | null>(null);
  const [activePlan, setActivePlan] = useState<CanvasCombinationPlanApiDetail | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isPlanBusy, setIsPlanBusy] = useState(false);
  const [shardSize, setShardSize] = useState(20);
  const [allowHighCost, setAllowHighCost] = useState(false);

  useEffect(() => {
    setSettings(getCombinationNodeSettings(selectedNode.settingsJson));
  }, [selectedNode.id, selectedNode.settingsJson]);

  const sourceSummaries = useMemo(
    () =>
      preview?.sources
        ? preview.sources.map((source) => ({
            inputNodeId: source.input_node_id,
            inputNodeTitle: source.input_node_title,
            sourceType: source.source_type,
            totalItems: source.total_items,
            enabledItems: source.enabled_items,
          }))
        : (snapshotDetail?.sources ?? []),
    [preview?.sources, snapshotDetail?.sources],
  );
  const sampleLabels = preview?.sample_labels ?? snapshotDetail?.sampleLabels ?? [];
  const governanceSignals = preview?.governance_signals ?? snapshotDetail?.governanceSignals ?? [];
  const governanceAction = preview?.governance_action ?? activePlan?.governance_action ?? null;

  const saveSettings = async (nextSettings: CanvasCombinationNodeSettings) => {
    setSettings(nextSettings);
    setIsSavingSettings(true);

    try {
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          settingsJson: nextSettings,
        },
        "组合配置保存失败。",
      );
      await onRefreshRuntime("组合节点摘要刷新失败。");
      toast.success("组合配置已保存。");
    } catch (error) {
      setSettings(getCombinationNodeSettings(selectedNode.settingsJson));
      toast.error(error instanceof Error ? error.message : "组合配置保存失败。");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const runPreview = async () => {
    setIsPreviewLoading(true);

    try {
      const result = await previewCanvasCombinationPlan(
        apiContext,
        selectedNode.id,
        {
          mode: settings.mode,
          anchorInputNodeId: settings.anchorInputNodeId,
          sampleSize: settings.sampleSize,
        },
        "组合预估失败。",
      );
      setPreview(result);
      await onRefreshRuntime("组合节点摘要刷新失败。");
      toast.success("组合预估已刷新。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "组合预估失败。");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const createPlan = async () => {
    setIsPlanBusy(true);

    try {
      const plan = await createCanvasCombinationPlan(
        apiContext,
        selectedNode.id,
        {
          mode: settings.mode,
          anchorInputNodeId: settings.anchorInputNodeId,
          sampleSize: settings.sampleSize,
          shardSize,
        },
        "创建组合计划失败。",
      );
      setActivePlan(plan);
      await onRefreshRuntime("组合计划摘要刷新失败。");
      toast.success("组合计划已创建。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建组合计划失败。");
    } finally {
      setIsPlanBusy(false);
    }
  };

  const handlePlanAction = async (action: "run" | "pause" | "resume" | "cancel") => {
    if (!activePlan?.id) {
      toast.error("先创建组合计划。");
      return;
    }

    setIsPlanBusy(true);

    try {
      const plan =
        action === "run"
          ? await runCanvasCombinationPlan(apiContext, activePlan.id, { allowHighCost }, "启动组合计划失败。")
          : action === "pause"
            ? await pauseCanvasCombinationPlan(apiContext, activePlan.id, "暂停组合计划失败。")
            : action === "resume"
              ? await resumeCanvasCombinationPlan(apiContext, activePlan.id, { allowHighCost }, "恢复组合计划失败。")
              : await cancelCanvasCombinationPlan(apiContext, activePlan.id, "取消组合计划失败。");
      setActivePlan(plan);
      await onRefreshRuntime("组合计划状态刷新失败。");
      toast.success(
        action === "run"
          ? "组合计划已启动。"
          : action === "pause"
            ? "组合计划已暂停。"
            : action === "resume"
              ? "组合计划已恢复。"
              : "组合计划已取消。",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "组合计划操作失败。");
    } finally {
      setIsPlanBusy(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="w-full max-w-5xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedNode.title}</p>
              <p className="text-xs text-muted-foreground">组合节点只负责编排输入组合。真正执行生成的仍然是它下游连接的文本、图片或视频节点。</p>
            </div>
            <div className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
              {activePlan ? `计划 ${activePlan.status}` : "尚未创建计划"}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.98fr_1.02fr]">
            <div className="space-y-3 rounded-[22px] border bg-muted/20 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>组合模式</span>
                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                    disabled={!canEdit || isSavingSettings || isPlanBusy}
                    value={settings.mode}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        mode:
                          event.target.value === "cartesian" || event.target.value === "anchor" || event.target.value === "custom_mapping"
                            ? event.target.value
                            : "zip",
                      }))
                    }
                  >
                    <option value="zip">zip 一一配对</option>
                    <option value="cartesian">cartesian 全组合</option>
                    <option value="anchor">anchor 主输入扩展</option>
                    <option value="custom_mapping">custom 自定义映射</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>样例数量</span>
                  <Input
                    disabled={!canEdit || isSavingSettings || isPlanBusy}
                    max={12}
                    min={1}
                    type="number"
                    value={settings.sampleSize}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        sampleSize: clampNumber(Number(event.target.value) || DEFAULT_COMBINATION_NODE_SETTINGS.sampleSize, 1, 12),
                      }))
                    }
                  />
                </label>
              </div>

              {settings.mode === "anchor" ? (
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>主输入源</span>
                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                    disabled={!canEdit || isSavingSettings || isPlanBusy || sourceSummaries.length === 0}
                    value={settings.anchorInputNodeId ?? ""}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        anchorInputNodeId: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">自动使用第一个输入源</option>
                    {sourceSummaries.map((source) => (
                      <option key={source.inputNodeId} value={source.inputNodeId}>
                        {source.inputNodeTitle}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">输入源</div>
                  <div className="mt-1 text-lg font-semibold">{preview?.input_source_count ?? snapshotDetail?.inputSourceCount ?? 0}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">预计组合</div>
                  <div className="mt-1 text-lg font-semibold">{preview?.estimated_combination_count ?? snapshotDetail?.estimatedCombinationCount ?? 0}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">治理信号</div>
                  <div className="mt-1 text-sm font-semibold">{governanceSignals.length > 0 ? governanceSignals.join(" / ") : "none"}</div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>分片大小</span>
                  <Input
                    disabled={!canEdit || isPlanBusy}
                    min={1}
                    type="number"
                    value={shardSize}
                    onChange={(event) => setShardSize(clampNumber(Number(event.target.value) || 20, 1, 50))}
                  />
                </label>
                <Button disabled={!canEdit || isSavingSettings || isPlanBusy} size="sm" type="button" variant="outline" onClick={() => void saveSettings(settings)}>
                  {isSavingSettings ? "保存中..." : "保存组合配置"}
                </Button>
                <Button disabled={isPreviewLoading || isPlanBusy} size="sm" type="button" onClick={() => void runPreview()}>
                  {isPreviewLoading ? "预估中..." : "预估组合"}
                </Button>
              </div>

              {(governanceAction === "confirm" || governanceAction === "manual_approval") ? (
                <label className="flex items-center gap-2 rounded-2xl border bg-amber-50 px-3 py-3 text-xs text-amber-800">
                  <input checked={allowHighCost} type="checkbox" onChange={(event) => setAllowHighCost(event.target.checked)} />
                  我确认按高成本组合计划继续执行
                </label>
              ) : null}

              <div className="rounded-2xl border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
                推荐用法：先点“预估组合”，确认数量后创建计划。最终生成仍然由下游文本/图片/视频节点执行，组合节点本身不直接产出内容。
              </div>
            </div>

            <div className="space-y-3 rounded-[22px] border bg-background/70 p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">输入源摘要</p>
                  <Button disabled={!canEdit || isPlanBusy} size="sm" type="button" variant="outline" onClick={() => void createPlan()}>
                    {isPlanBusy ? "处理中..." : "创建计划"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {sourceSummaries.length > 0 ? (
                    sourceSummaries.map((source) => (
                      <div key={source.inputNodeId} className="rounded-2xl border bg-background px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{source.inputNodeTitle}</p>
                            <p className="text-[11px] text-muted-foreground">{source.sourceType.toUpperCase()}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{source.enabledItems} 启用</div>
                            <div>{source.totalItems} 总项</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      先把至少两个输入源节点连接到当前组合节点，再点击“预估组合”。
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">组合样例</p>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {sampleLabels.length > 0 ? (
                    sampleLabels.map((label, index) => (
                      <div key={`${label}-${index}`} className="rounded-2xl border bg-background px-3 py-3 text-sm">
                        <span className="mr-2 rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">#{index + 1}</span>
                        {label}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      预估后会在这里显示前几组样例。
                    </div>
                  )}
                </div>
              </div>

              {activePlan ? (
                <div className="space-y-3 rounded-2xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">当前计划</p>
                      <p className="text-[11px] text-muted-foreground">状态 {activePlan.status} · 预计 {activePlan.estimated_combination_count} 组</p>
                    </div>
                    <div className="rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground">{activePlan.id.slice(0, 8)}</div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-4">
                    <Button disabled={isPlanBusy || activePlan.status === "queued" || activePlan.status === "running"} size="sm" type="button" onClick={() => void handlePlanAction("run")}>
                      启动
                    </Button>
                    <Button disabled={isPlanBusy || (activePlan.status !== "queued" && activePlan.status !== "running")} size="sm" type="button" variant="outline" onClick={() => void handlePlanAction("pause")}>
                      暂停
                    </Button>
                    <Button disabled={isPlanBusy || activePlan.status !== "paused"} size="sm" type="button" variant="outline" onClick={() => void handlePlanAction("resume")}>
                      恢复
                    </Button>
                    <Button disabled={isPlanBusy || activePlan.status === "canceled"} size="sm" type="button" variant="outline" onClick={() => void handlePlanAction("cancel")}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type TextNodePanelProps = {
  selectedNode: CanvasNode;
  canGenerate: boolean;
  generateLabel?: string;
  draftPrompt: string;
  isSavingPrompt: boolean;
  isTaskActive: boolean;
  isGenerating: boolean;
  isCoolingDown: boolean;
  onPromptChange: (value: string) => void;
  onOpenExpandedEditor: () => void;
  onSavePrompt: () => void;
  onGenerate: () => void;
};

export function TextNodePanel({
  selectedNode,
  canGenerate,
  generateLabel,
  draftPrompt,
  isSavingPrompt,
  isTaskActive,
  isGenerating,
  isCoolingDown,
  onPromptChange,
  onOpenExpandedEditor,
  onSavePrompt,
  onGenerate,
}: TextNodePanelProps) {
  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="w-full max-w-4xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedNode.title}</p>
            <p className="text-xs text-muted-foreground">这里是给 AI 的输入区，上游文本连线会自动拼进当前节点 prompt。</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" type="button" variant="outline" onClick={onOpenExpandedEditor}>
              <Expand className="mr-1 size-4" />
              放大输入
            </Button>
          </div>
        </div>

        <Textarea
          className="min-h-28 resize-none rounded-2xl border-0 bg-muted/40 shadow-none focus-visible:ring-2"
          placeholder="写下你想让 AI 生成的故事、场景、角色设定或文本指令…"
          value={draftPrompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            双击文本节点可直接编辑正文内容；这里则是给 AI 的提示输入
            {isTaskActive ? " · 当前正在生成中" : isCoolingDown ? " · 已提交生成，请稍候" : "。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button disabled={isSavingPrompt} size="sm" type="button" variant="outline" onClick={onSavePrompt}>
              {isSavingPrompt ? "保存中..." : "保存提示词"}
            </Button>
            <Button
              disabled={isSavingPrompt || isGenerating || isCoolingDown || isTaskActive || !canGenerate}
              size="sm"
              type="button"
              onClick={onGenerate}
            >
              {isGenerating
                ? "提交中..."
                : isTaskActive
                  ? "生成中..."
                  : isCoolingDown
                    ? "已提交"
                    : (generateLabel ?? "AI 生成内容")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type StoryboardNodePanelProps = {
  selectedNode: CanvasNode;
  canEdit: boolean;
  canGenerate: boolean;
  generateLabel?: string;
  draftPrompt: string;
  draftSettings: StoryboardNodeSettings;
  storyboardShots: StoryboardShot[];
  storyboardTotalDurationSec: number;
  linkedImageCount: number;
  activeShotIndex: number;
  activeShotDraft: StoryboardShot | null;
  isSavingPrompt: boolean;
  isSavingShot: boolean;
  isTaskActive: boolean;
  isGenerating: boolean;
  isCreatingVideoNode: boolean;
  availablePromptAssets: CanvasNodeReferenceAsset[];
  onPromptChange: (value: string) => void;
  onSettingsChange: (updater: (current: StoryboardNodeSettings) => StoryboardNodeSettings) => void;
  onActiveShotChange: (shotIndex: number) => void;
  onActiveShotDraftChange: (updater: (current: StoryboardShot | null) => StoryboardShot | null) => void;
  onSavePrompt: () => void;
  onSaveShot: () => void;
  onGenerate: () => void;
  onCreateVideoNode: () => void;
  onGenerateVideo: () => void;
  onCreateAllShotVideoNodes: () => void;
  onCreateCurrentShotVideoNode: () => void;
  onGenerateCurrentShotVideo: () => void;
  onLinkPromptAsset: (asset: CanvasNodeReferenceAsset) => void;
};

export function StoryboardNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
  generateLabel,
  draftPrompt,
  draftSettings,
  storyboardShots,
  storyboardTotalDurationSec,
  linkedImageCount,
  activeShotIndex,
  activeShotDraft,
  isSavingPrompt,
  isSavingShot,
  isTaskActive,
  isGenerating,
  isCreatingVideoNode,
  availablePromptAssets,
  onPromptChange,
  onSettingsChange,
  onActiveShotChange,
  onActiveShotDraftChange,
  onSavePrompt,
  onSaveShot,
  onGenerate,
  onCreateVideoNode,
  onGenerateVideo,
  onCreateAllShotVideoNodes,
  onCreateCurrentShotVideoNode,
  onGenerateCurrentShotVideo,
  onLinkPromptAsset,
}: StoryboardNodePanelProps) {
  const hasShots = storyboardShots.length > 0;
  const activeShotAssetNames = activeShotDraft ? getStoryboardShotAssetNames(activeShotDraft) : [];

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="flex max-h-[68vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border bg-background/96 shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedNode.title}</p>
            <p className="text-xs text-muted-foreground">
              {draftSettings.generationMode === "smart_storyboard"
                ? "当前为智能分镜：系统会基于故事梗概自动补足镜头节奏、景别变化、转场和情绪推进，并输出结构化分镜 JSON。"
                : "当前为标准分镜：系统会按输入内容拆分镜头，并输出结构化分镜 JSON。"}
            </p>
          </div>
          <div className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            模板 · {draftSettings.templateFile}
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-3 py-3">
          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <PromptAssetTextarea
              contextAssets={availablePromptAssets}
              linkedAssets={selectedNode.referenceAssets ?? []}
              minHeightClassName="min-h-32 max-h-48 max-w-full resize-y"
              placeholder="输入故事梗概、角色、场景、节奏、镜头风格和关键动作，系统会自动生成连续分镜；输入 @ 可引用已关联图片"
              value={draftPrompt}
              onChange={onPromptChange}
              onLinkAsset={onLinkPromptAsset}
              onPreviewAsset={(asset) => window.open(asset.fileUrl, "_blank", "noopener,noreferrer")}
              onUnlinkAsset={(assetId) => {
                const nextValue = draftPrompt.replace(new RegExp(`@\\[[^\\]]+\\]\\{asset:${assetId}\\}\\s*`, "g"), "");
                onPromptChange(nextValue.trim());
              }}
            />

            <div className="grid min-w-0 gap-3">
              <div className="grid min-w-0 gap-3 rounded-2xl bg-muted/25 p-3 md:grid-cols-3">
                <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                  <span>分镜方式</span>
                  <select
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                    value={draftSettings.generationMode}
                    onChange={(event) =>
                      onSettingsChange((current) => ({
                        ...current,
                        generationMode: event.target.value === "standard" ? "standard" : "smart_storyboard",
                      }))
                    }
                  >
                    <option value="smart_storyboard">智能分镜</option>
                    <option value="standard">标准分镜</option>
                  </select>
                </label>
                <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                  <span>镜头数量</span>
                  <Input
                    disabled={!canEdit}
                    max={24}
                    min={1}
                    type="number"
                    value={draftSettings.shotCount}
                    onChange={(event) =>
                      onSettingsChange((current) => ({
                        ...current,
                        shotCount: clampNumber(
                          Number(event.target.value) || DEFAULT_STORYBOARD_NODE_SETTINGS.shotCount,
                          1,
                          24,
                        ),
                      }))
                    }
                  />
                </label>
                <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
                  <span>输出状态</span>
                  <div className="flex h-9 min-w-0 items-center overflow-hidden rounded-xl border bg-background px-3 text-sm text-foreground">
                    {hasShots ? `${storyboardShots.length} 个镜头已生成` : "尚未生成分镜"}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">分镜方式</div>
                  <div className="mt-1 text-lg font-semibold">{draftSettings.generationMode === "smart_storyboard" ? "智能" : "标准"}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">目标镜头</div>
                  <div className="mt-1 text-lg font-semibold">{draftSettings.shotCount}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">已解析镜头</div>
                  <div className="mt-1 text-lg font-semibold">{storyboardShots.length}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">预估总时长</div>
                  <div className="mt-1 text-lg font-semibold">{storyboardTotalDurationSec > 0 ? `${storyboardTotalDurationSec}s` : "待生成"}</div>
                </div>
                <div className="rounded-2xl border bg-background/70 px-3 py-3">
                  <div className="text-[11px] text-muted-foreground">已连图片</div>
                  <div className="mt-1 text-lg font-semibold">{linkedImageCount}</div>
                </div>
              </div>

              <div className="rounded-2xl border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                {draftSettings.generationMode === "smart_storyboard"
                  ? "智能分镜会主动补镜头衔接、节奏变化和情绪推进。输出格式固定为 JSON，字段结构来自模板文件，videoPrompt 会强制保持英文。"
                  : "输出格式固定为 JSON，字段结构来自模板文件，videoPrompt 会强制保持英文。"}
                生成完成后可以直接创建分镜视频节点，并自动继承已连接的图片节点。
              </div>
            </div>
          </div>

          {hasShots && activeShotDraft ? (
            <div className="overflow-hidden rounded-[24px] border bg-muted/18 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Shot 编辑器</p>
                  <p className="text-xs text-muted-foreground">左右切换镜头，单独修改当前 shot，并为它创建专属视频节点。</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    disabled={activeShotIndex <= 0}
                    size="icon"
                    type="button"
                    variant="outline"
                    onClick={() => onActiveShotChange(Math.max(0, activeShotIndex - 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                    Shot {activeShotDraft.sequence} / {storyboardShots.length}
                  </div>
                  <Button
                    disabled={activeShotIndex >= storyboardShots.length - 1}
                    size="icon"
                    type="button"
                    variant="outline"
                    onClick={() => onActiveShotChange(Math.min(storyboardShots.length - 1, activeShotIndex + 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="grid min-w-0 gap-3">
                  <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                    <span>场景名</span>
                    <Input
                      disabled={!canEdit}
                      value={activeShotDraft.sceneLabel}
                      onChange={(event) =>
                        onActiveShotDraftChange((current) =>
                          current
                            ? {
                                ...current,
                                sceneLabel: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>景别</span>
                      <Input
                        disabled={!canEdit}
                        value={activeShotDraft.size}
                        onChange={(event) =>
                          onActiveShotDraftChange((current) =>
                            current
                              ? {
                                  ...current,
                                  size: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>机位 / 运动</span>
                      <Input
                        disabled={!canEdit}
                        value={activeShotDraft.camera}
                        onChange={(event) =>
                          onActiveShotDraftChange((current) =>
                            current
                              ? {
                                  ...current,
                                  camera: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>情绪</span>
                      <Input
                        disabled={!canEdit}
                        value={activeShotDraft.emotion}
                        onChange={(event) =>
                          onActiveShotDraftChange((current) =>
                            current
                              ? {
                                  ...current,
                                  emotion: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>时长</span>
                      <Input
                        disabled={!canEdit}
                        min={1}
                        type="number"
                        value={activeShotDraft.duration ?? ""}
                        onChange={(event) =>
                          onActiveShotDraftChange((current) =>
                            current
                              ? {
                                  ...current,
                                  duration: event.target.value ? Math.max(1, Number(event.target.value)) : null,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>对白</span>
                    <Input
                      disabled={!canEdit}
                      value={activeShotDraft.dialogue}
                      onChange={(event) =>
                        onActiveShotDraftChange((current) =>
                          current
                            ? {
                                ...current,
                                dialogue: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>

                <div className="grid min-w-0 gap-3">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>镜头描述</span>
                    <Textarea
                      className="min-h-24 max-h-40 max-w-full resize-y rounded-2xl bg-background"
                      disabled={!canEdit}
                      value={activeShotDraft.description}
                      onChange={(event) =>
                        onActiveShotDraftChange((current) =>
                          current
                            ? {
                                ...current,
                                description: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>视频生成 Prompt</span>
                    <Textarea
                      className="min-h-28 max-h-44 max-w-full resize-y rounded-2xl bg-background"
                      disabled={!canEdit}
                      value={activeShotDraft.videoPrompt}
                      onChange={(event) =>
                        onActiveShotDraftChange((current) =>
                          current
                            ? {
                                ...current,
                                videoPrompt: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  {activeShotAssetNames.length > 0 ? (
                    <div className="rounded-2xl border bg-background/80 px-3 py-3">
                      <p className="text-xs text-muted-foreground">当前 Shot 提取资产</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeShotAssetNames.map((assetName) => (
                          <span key={assetName} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
                            {assetName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">当前 shot 会同步回分镜 JSON，并可直接生成单镜头视频节点。</p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isSavingShot || !canEdit} size="sm" type="button" variant="outline" onClick={onSaveShot}>
                    {isSavingShot ? "保存中..." : "保存当前 Shot"}
                  </Button>
                  <Button
                    disabled={isCreatingVideoNode || !canEdit}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={onCreateCurrentShotVideoNode}
                  >
                    <Clapperboard className="mr-1 size-4" />
                    当前 Shot 视频节点
                  </Button>
                  <Button
                    disabled={isCreatingVideoNode || !canEdit || !canGenerate}
                    size="sm"
                    type="button"
                    onClick={onGenerateCurrentShotVideo}
                  >
                    <Sparkles className="mr-1 size-4" />
                    生成当前 Shot 视频
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              目标输出 {draftSettings.shotCount} 个连续镜头
              {isTaskActive
                ? " · 当前正在生成中"
                : hasShots
                  ? " · 当前分镜已可直接转为视频节点。"
                  : ` · ${draftSettings.generationMode === "smart_storyboard" ? "将按智能分镜方式生成。" : "生成结果会作为结构化 JSON 回写到节点。"}`}
            </p>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button disabled={isSavingPrompt || !canEdit} size="sm" type="button" variant="outline" onClick={onSavePrompt}>
                {isSavingPrompt ? "保存中..." : "保存配置"}
              </Button>
              <Button
                disabled={isSavingPrompt || isGenerating || isTaskActive || !canGenerate}
                size="sm"
                type="button"
                onClick={onGenerate}
              >
                {isGenerating
                  ? "提交中..."
                  : isTaskActive
                    ? "生成中..."
                    : draftSettings.generationMode === "smart_storyboard"
                      ? "AI 智能分镜"
                      : (generateLabel ?? "AI 生成分镜")}
              </Button>
              <Button
                disabled={!hasShots || isCreatingVideoNode || !canEdit}
                size="sm"
                type="button"
                variant="outline"
                onClick={onCreateVideoNode}
              >
                <Clapperboard className="mr-1 size-4" />
                {isCreatingVideoNode ? "创建中..." : "创建整段视频节点"}
              </Button>
              <Button
                disabled={!hasShots || isCreatingVideoNode || !canEdit}
                size="sm"
                type="button"
                variant="outline"
                onClick={onCreateAllShotVideoNodes}
              >
                <Clapperboard className="mr-1 size-4" />
                {isCreatingVideoNode ? "创建中..." : "一键创建所有 Shot"}
              </Button>
              <Button
                disabled={!hasShots || isCreatingVideoNode || !canGenerate || !canEdit}
                size="sm"
                type="button"
                onClick={onGenerateVideo}
              >
                <Sparkles className="mr-1 size-4" />
                {isCreatingVideoNode ? "处理中..." : "一键生成分镜视频"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ImageNodePanelProps = {
  selectedNode: CanvasNode;
  canEdit: boolean;
  canGenerate: boolean;
  generateLabel?: string;
  imageUploadInputRef: React.RefObject<HTMLInputElement | null>;
  draftImagePrompt: string;
  isSavingImagePrompt: boolean;
  isUploadingReferenceImages: boolean;
  isGenerating: boolean;
  isTaskActive: boolean;
  selectedImageOutputSource: string | null;
  onPromptChange: (value: string) => void;
  onUploadReferenceImages: (files: FileList | null) => void;
  onSavePrompt: () => void;
  onGenerate: () => void;
  onDownloadImage: () => void;
  onSaveToLibrary: () => void;
  onDownloadReferenceAsset: (asset: CanvasNodeReferenceAsset) => void;
  onRemoveReferenceImage: (assetId: string) => void;
  onLinkPromptAsset: (asset: CanvasNodeReferenceAsset) => void;
  availablePromptAssets: CanvasNodeReferenceAsset[];
};

export function ImageNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
  generateLabel,
  imageUploadInputRef,
  draftImagePrompt,
  isSavingImagePrompt,
  isUploadingReferenceImages,
  isGenerating,
  isTaskActive,
  selectedImageOutputSource,
  onPromptChange,
  onUploadReferenceImages,
  onSavePrompt,
  onGenerate,
  onDownloadImage,
  onSaveToLibrary,
  onDownloadReferenceAsset,
  onRemoveReferenceImage,
  onLinkPromptAsset,
  availablePromptAssets,
}: ImageNodePanelProps) {
  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="w-full max-w-5xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
        <input
          ref={imageUploadInputRef}
          accept="image/*"
          className="hidden"
          multiple
          type="file"
          onChange={(event) => onUploadReferenceImages(event.target.files)}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedNode.title}</p>
              <p className="text-xs text-muted-foreground">上游文本连线会进入 prompt，上游图片连线会自动作为参考图。</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                disabled={!canEdit || isUploadingReferenceImages}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => imageUploadInputRef.current?.click()}
              >
                <Upload className="mr-1 size-4" />
                {isUploadingReferenceImages ? "上传中..." : "上传图片"}
              </Button>
              <Button
                disabled={!selectedImageOutputSource}
                size="sm"
                type="button"
                variant="outline"
                onClick={onSaveToLibrary}
              >
                <Sparkles className="mr-1 size-4" />
                沉淀为资源
              </Button>
              <Button
                disabled={!selectedImageOutputSource}
                size="sm"
                type="button"
                variant="outline"
                onClick={onDownloadImage}
              >
                <Download className="mr-1 size-4" />
                下载图片
              </Button>
            </div>
          </div>

          <PromptAssetTextarea
            contextAssets={availablePromptAssets}
            linkedAssets={selectedNode.referenceAssets ?? []}
            placeholder="描述你想生成的画面风格、主体、场景，也可以先上传参考图再做图生图；输入 @ 可引用已关联图片"
            value={draftImagePrompt}
            onChange={onPromptChange}
            onLinkAsset={onLinkPromptAsset}
            onPreviewAsset={onDownloadReferenceAsset}
            onUnlinkAsset={(assetId) => {
              const nextValue = draftImagePrompt.replace(new RegExp(`@\\[[^\\]]+\\]\\{asset:${assetId}\\}\\s*`, "g"), "");
              onPromptChange(nextValue.trim());
            }}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {(selectedNode.referenceAssets?.length ?? 0) > 0
                ? `已关联 ${selectedNode.referenceAssets?.length ?? 0} 张参考图`
                : "当前没有参考图，直接按提示词出图"}
              {selectedImageOutputSource ? " · 结果会直接显示在节点上。" : "。"}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                disabled={isSavingImagePrompt || !canEdit}
                size="sm"
                type="button"
                variant="outline"
                onClick={onSavePrompt}
              >
                {isSavingImagePrompt ? "保存中..." : "保存提示词"}
              </Button>
              <Button
                disabled={isSavingImagePrompt || isGenerating || isTaskActive || !canGenerate}
                size="sm"
                type="button"
                onClick={onGenerate}
              >
                {isGenerating ? "提交中..." : isTaskActive ? "生成中..." : (generateLabel ?? "AI 生成图片")}
              </Button>
            </div>
          </div>

          {selectedNode.referenceAssets?.length ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {selectedNode.referenceAssets.map((asset) => (
                <div key={asset.id} className="relative shrink-0">
                  <button
                    className="block h-16 w-16 overflow-hidden rounded-xl border bg-background shadow-sm transition hover:opacity-90"
                    type="button"
                    onClick={() => onDownloadReferenceAsset(asset)}
                  >
                    <img alt={asset.fileName} className="h-full w-full object-cover" src={asset.fileUrl} />
                  </button>
                  <button
                    aria-label="移除参考图"
                    className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                    disabled={!canEdit || isUploadingReferenceImages}
                    type="button"
                    onClick={() => onRemoveReferenceImage(asset.id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type VideoNodePanelProps = {
  selectedNode: CanvasNode;
  canEdit: boolean;
  canGenerate: boolean;
  generateLabel?: string;
  videoFirstFrameInputRef: React.RefObject<HTMLInputElement | null>;
  videoLastFrameInputRef: React.RefObject<HTMLInputElement | null>;
  videoReferenceInputRef: React.RefObject<HTMLInputElement | null>;
  draftVideoPrompt: string;
  draftVideoSettings: VideoNodeSettings;
  draftVideoModelKey: string;
  selectedVideoOutputSource: string | null;
  selectedVideoFirstFrameAsset: CanvasNodeReferenceAsset | null;
  selectedVideoLastFrameAsset: CanvasNodeReferenceAsset | null;
  selectedVideoReferenceAssets: CanvasNodeReferenceAsset[];
  isSavingVideoPrompt: boolean;
  isUploadingVideoImages: boolean;
  isGenerating: boolean;
  isTaskActive: boolean;
  onPromptChange: (value: string) => void;
  onModelKeyChange: (value: string) => void;
  onSettingsChange: (updater: (current: VideoNodeSettings) => VideoNodeSettings) => void;
  onUploadVideoImages: (role: "first_frame" | "last_frame" | "reference", files: FileList | null) => void;
  onDownloadVideo: () => void;
  onSavePrompt: () => void;
  onGenerate: () => void;
  onRemoveVideoAsset: (assetId: string) => void;
  onLinkPromptAsset: (asset: CanvasNodeReferenceAsset) => void;
  availablePromptAssets: CanvasNodeReferenceAsset[];
};

export function VideoNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
  generateLabel,
  videoFirstFrameInputRef,
  videoLastFrameInputRef,
  videoReferenceInputRef,
  draftVideoPrompt,
  draftVideoSettings,
  draftVideoModelKey,
  selectedVideoOutputSource,
  selectedVideoFirstFrameAsset,
  selectedVideoLastFrameAsset,
  selectedVideoReferenceAssets,
  isSavingVideoPrompt,
  isUploadingVideoImages,
  isGenerating,
  isTaskActive,
  onPromptChange,
  onModelKeyChange,
  onSettingsChange,
  onUploadVideoImages,
  onDownloadVideo,
  onSavePrompt,
  onGenerate,
  onRemoveVideoAsset,
  onLinkPromptAsset,
  availablePromptAssets,
}: VideoNodePanelProps) {
  const isSeedanceVideoModel = isSeedanceVideoModelKey(draftVideoModelKey);
  const isReferenceVideoMode = draftVideoSettings.generationMode === "reference";
  const isFirstLastVideoMode = draftVideoSettings.generationMode === "first_last";
  const isMultiShotVideoMode = draftVideoSettings.generationMode === "multi_shot";
  const isSmartStoryboardVideoMode = draftVideoSettings.generationMode === "smart_storyboard";
  const isStoryboardVideoMode = isMultiShotVideoMode || isSmartStoryboardVideoMode;
  const hasPresetVideoModel = VIDEO_MODEL_PRESET_OPTIONS.some((option) => option.value === draftVideoModelKey);
  const selectedVideoModelPreset = draftVideoModelKey.length === 0 || hasPresetVideoModel ? draftVideoModelKey : "__custom__";
  const previewFallbackAsset =
    selectedVideoFirstFrameAsset ?? selectedVideoLastFrameAsset ?? selectedVideoReferenceAssets[0] ?? null;
  const fallbackAspectRatio =
    draftVideoSettings.size === "16:9" ? 16 / 9 : draftVideoSettings.size === "1:1" ? 1 : 9 / 16;
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [videoPreviewAspectRatio, setVideoPreviewAspectRatio] = useState<number | null>(null);
  const resolvedVideoAspectRatio = videoPreviewAspectRatio ?? fallbackAspectRatio;
  const resolvedVideoAspectLabel = getVideoAspectRatioLabel(resolvedVideoAspectRatio) ?? draftVideoSettings.size;

  return (
    <>
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
        <div className="max-h-[calc(100vh-6rem)] w-full max-w-7xl overflow-y-auto rounded-[24px] border bg-background/96 p-3 shadow-lg">
        <input
          ref={videoFirstFrameInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(event) => onUploadVideoImages("first_frame", event.target.files)}
        />
        <input
          ref={videoLastFrameInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(event) => onUploadVideoImages("last_frame", event.target.files)}
        />
        <input
          ref={videoReferenceInputRef}
          accept="image/*"
          className="hidden"
          multiple
          type="file"
          onChange={(event) => onUploadVideoImages("reference", event.target.files)}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedNode.title}</p>
                <p className="text-xs text-muted-foreground">
                  {isFirstLastVideoMode
                    ? "当前为首尾帧模式；上游文本会进入 prompt，上游图片会补充为参考图。"
                    : isSmartStoryboardVideoMode
                      ? "当前为智能分镜模式；会优先按完整分镜语义组织镜头，上游文本会进入 prompt，上游图片会补充为参考图。"
                      : isMultiShotVideoMode
                        ? "当前为自定义多镜头模式；上游文本会进入 prompt，上游图片会补充为参考图。"
                        : "当前为参考生成模式；上游文本会进入 prompt，上游图片会补充为参考图。"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!isStoryboardVideoMode ? (
                  <Button
                    disabled={!canEdit || isUploadingVideoImages}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (isFirstLastVideoMode) {
                        videoFirstFrameInputRef.current?.click();

                        return;
                      }

                      videoReferenceInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-1 size-4" />
                    {isUploadingVideoImages ? "上传中..." : isFirstLastVideoMode ? "上传首帧" : "上传参考图"}
                  </Button>
                ) : null}
              </div>
            </div>

            <PromptAssetTextarea
              contextAssets={availablePromptAssets}
              linkedAssets={selectedNode.referenceAssets ?? []}
              minHeightClassName="min-h-32"
              placeholder="描述视频内容、镜头语言、运动方式、主体和节奏，也可以结合首尾帧或参考图生成；输入 @ 可引用已关联图片"
              value={draftVideoPrompt}
              onChange={onPromptChange}
              onLinkAsset={onLinkPromptAsset}
              onPreviewAsset={(asset) => window.open(asset.fileUrl, "_blank", "noopener,noreferrer")}
              onUnlinkAsset={(assetId) => {
                const nextValue = draftVideoPrompt.replace(new RegExp(`@\\[[^\\]]+\\]\\{asset:${assetId}\\}\\s*`, "g"), "");
                onPromptChange(nextValue.trim());
              }}
            />

            <div className="grid gap-3 rounded-2xl bg-muted/25 p-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>视频模型</span>
                <select
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                  disabled={!canEdit}
                  value={selectedVideoModelPreset}
                  onChange={(event) => onModelKeyChange(event.target.value === "__custom__" ? draftVideoModelKey : event.target.value)}
                >
                  {VIDEO_MODEL_PRESET_OPTIONS.map((option) => (
                    <option key={option.value || "default"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="__custom__">自定义模型</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>生成模式</span>
                <select
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                  disabled={!canEdit || isSeedanceVideoModel}
                  value={draftVideoSettings.generationMode}
                  onChange={(event) =>
                    onSettingsChange((current) => ({
                      ...current,
                      generationMode: event.target.value as VideoGenerationMode,
                    }))
                  }
                >
                  {isSeedanceVideoModel ? (
                    <option value="reference">参考生成（seedance-2.0）</option>
                  ) : (
                    <>
                      <option value="reference">参考生成</option>
                      <option value="first_last">首尾帧视频</option>
                      <option value="smart_storyboard">智能分镜</option>
                      <option value="multi_shot">自定义多镜头</option>
                    </>
                  )}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>画幅</span>
                <select
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                  value={draftVideoSettings.size}
                  onChange={(event) =>
                    onSettingsChange((current) => ({
                      ...current,
                      size: event.target.value === "16:9" || event.target.value === "1:1" ? event.target.value : "9:16",
                    }))
                  }
                >
                  <option value="9:16">9:16 竖版</option>
                  <option value="16:9">16:9 横版</option>
                  <option value="1:1">1:1 方形</option>
                </select>
              </label>
              <div className="space-y-1 text-xs text-muted-foreground">
                <span>声音</span>
                <Button
                  className="w-full justify-center"
                  size="sm"
                  type="button"
                  variant={draftVideoSettings.withAudio ? "default" : "outline"}
                  onClick={() =>
                    onSettingsChange((current) => ({
                      ...current,
                      withAudio: !current.withAudio,
                    }))
                  }
                >
                  {draftVideoSettings.withAudio ? "生成带声音视频" : "生成静音视频"}
                </Button>
              </div>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>时长（秒）</span>
                <Input
                  max={30}
                  min={1}
                  type="number"
                  value={draftVideoSettings.durationSec}
                  onChange={(event) =>
                    onSettingsChange((current) => ({
                      ...current,
                      durationSec: clampNumber(Number(event.target.value) || DEFAULT_VIDEO_NODE_SETTINGS.durationSec, 1, 30),
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>运动强度（1-100）</span>
                <Input
                  max={100}
                  min={1}
                  type="number"
                  value={draftVideoSettings.motionStrength}
                  onChange={(event) =>
                    onSettingsChange((current) => ({
                      ...current,
                      motionStrength: clampNumber(Number(event.target.value) || DEFAULT_VIDEO_NODE_SETTINGS.motionStrength, 1, 100),
                    }))
                  }
                />
              </label>
            </div>

            {selectedVideoModelPreset === "__custom__" ? (
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>自定义模型 Key</span>
                <Input
                  placeholder="例如：kling-3.0-master"
                  value={draftVideoModelKey}
                  onChange={(event) => onModelKeyChange(event.target.value)}
                />
              </label>
            ) : null}

            {isMultiShotVideoMode ? (
              <Textarea
                className="min-h-24 resize-none rounded-2xl border-0 bg-muted/30 shadow-none focus-visible:ring-2"
                placeholder={"一行一个镜头，例如：\n镜头 1：产品从暗处转入主光，缓慢推进\n镜头 2：特写展示材质与细节\n镜头 3：人物上手使用并收尾定格"}
                value={draftVideoSettings.shotPrompts.join("\n")}
                onChange={(event) =>
                  onSettingsChange((current) => ({
                    ...current,
                    shotPrompts: event.target.value
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {isFirstLastVideoMode
                  ? `${selectedVideoFirstFrameAsset ? "已设置首帧" : "未设置首帧"} · ${selectedVideoLastFrameAsset ? "已设置末帧" : "未设置末帧"}`
                  : isSmartStoryboardVideoMode
                    ? `已准备 ${draftVideoSettings.shotPrompts.length} 条分镜参考`
                    : isMultiShotVideoMode
                      ? `已配置 ${draftVideoSettings.shotPrompts.length} 个镜头`
                      : `已关联 ${selectedVideoReferenceAssets.length} 张参考图`}
                {draftVideoModelKey.trim() ? ` · 当前模型 ${draftVideoModelKey.trim()}` : " · 当前使用默认视频模型"}
                {isSeedanceVideoModel ? " · seedance-2.0 仅支持参考图模式" : ""}
                {draftVideoSettings.withAudio ? " · 将请求带声音视频" : " · 当前请求静音视频"}
                {selectedVideoOutputSource ? " · 结果会直接显示在右侧预览区。" : "。"}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  disabled={isSavingVideoPrompt || !canEdit}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={onSavePrompt}
                >
                  {isSavingVideoPrompt ? "保存中..." : "保存配置"}
                </Button>
                <Button
                  disabled={isSavingVideoPrompt || isGenerating || isTaskActive || !canGenerate}
                  size="sm"
                  type="button"
                  onClick={onGenerate}
                >
                  {isGenerating ? "提交中..." : isTaskActive ? "生成中..." : (generateLabel ?? "AI 生成视频")}
                </Button>
              </div>
            </div>

            {isFirstLastVideoMode ? (
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">首帧</p>
                    <Button
                      disabled={!canEdit || isUploadingVideoImages}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => videoFirstFrameInputRef.current?.click()}
                    >
                      上传
                    </Button>
                  </div>
                  {selectedVideoFirstFrameAsset ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border">
                      <img
                        alt={selectedVideoFirstFrameAsset.fileName}
                        className="h-full w-full object-cover"
                        src={selectedVideoFirstFrameAsset.fileUrl}
                      />
                      <button
                        aria-label="移除首帧"
                        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                        disabled={!canEdit || isUploadingVideoImages}
                        type="button"
                        onClick={() => onRemoveVideoAsset(selectedVideoFirstFrameAsset.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                      上传首帧参考
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">末帧</p>
                    <Button
                      disabled={!canEdit || isUploadingVideoImages}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => videoLastFrameInputRef.current?.click()}
                    >
                      上传
                    </Button>
                  </div>
                  {selectedVideoLastFrameAsset ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border">
                      <img
                        alt={selectedVideoLastFrameAsset.fileName}
                        className="h-full w-full object-cover"
                        src={selectedVideoLastFrameAsset.fileUrl}
                      />
                      <button
                        aria-label="移除末帧"
                        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                        disabled={!canEdit || isUploadingVideoImages}
                        type="button"
                        onClick={() => onRemoveVideoAsset(selectedVideoLastFrameAsset.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                      上传末帧参考
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {isReferenceVideoMode ? (
              <div className="rounded-2xl border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">参考图</p>
                  <Button
                    disabled={!canEdit || isUploadingVideoImages}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => videoReferenceInputRef.current?.click()}
                  >
                    上传
                  </Button>
                </div>
                {selectedVideoReferenceAssets.length ? (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {selectedVideoReferenceAssets.map((asset) => (
                      <div key={asset.id} className="relative shrink-0">
                        <img alt={asset.fileName} className="h-16 w-16 rounded-xl border object-cover" src={asset.fileUrl} />
                        <button
                          aria-label="移除参考图"
                          className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                          disabled={!canEdit || isUploadingVideoImages}
                          type="button"
                          onClick={() => onRemoveVideoAsset(asset.id)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                    上传参考图做视频参考生成
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-[22px] border bg-muted/18 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">当前视频预览</p>
                <p className="text-xs text-muted-foreground">
                  右侧固定预览当前选中视频节点，参数配置保持在左侧正常显示。
                </p>
              </div>
              <div className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {resolvedVideoAspectLabel}
              </div>
            </div>

            <div className="overflow-hidden rounded-[20px] border bg-black">
              <div className="relative w-full" style={{ aspectRatio: `${resolvedVideoAspectRatio}` }}>
                {selectedVideoOutputSource ? (
                  <>
                    <video
                      key={selectedVideoOutputSource}
                      className="h-full w-full object-contain"
                      controls
                      playsInline
                      preload="metadata"
                      src={selectedVideoOutputSource}
                      onLoadedMetadata={(event) => {
                        const { videoWidth, videoHeight } = event.currentTarget;

                        if (videoWidth > 0 && videoHeight > 0) {
                          setVideoPreviewAspectRatio(videoWidth / videoHeight);
                        }
                      }}
                    />
                    <div className="absolute right-3 top-3 z-10 flex gap-2">
                      <Button size="sm" type="button" variant="secondary" onClick={() => setIsVideoPreviewOpen(true)}>
                        <Expand className="mr-1 size-4" />
                        放大
                      </Button>
                      <Button size="sm" type="button" variant="secondary" onClick={() => window.open(selectedVideoOutputSource, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="mr-1 size-4" />
                        原链接
                      </Button>
                      <Button size="sm" type="button" variant="secondary" onClick={onDownloadVideo}>
                        <Download className="mr-1 size-4" />
                        下载
                      </Button>
                    </div>
                  </>
                ) : previewFallbackAsset ? (
                  <div className="relative h-full w-full">
                    <img
                      alt={previewFallbackAsset.fileName}
                      className="h-full w-full object-contain opacity-90"
                      src={previewFallbackAsset.fileUrl}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                      <div className="rounded-full bg-background/90 px-3 py-1 text-xs text-foreground shadow-sm">
                        暂无生成结果，当前展示参考图
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div>
                      <div className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-white/10 text-white">
                        <Video className="size-5" />
                      </div>
                      <p className="text-sm font-medium text-white">当前还没有可预览的视频结果</p>
                      <p className="mt-1 text-xs text-white/70">左侧完成参数配置后生成，结果会直接显示在这里。</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {selectedVideoOutputSource ? "供应商外链视频" : "等待视频结果"}
              </div>
              <div className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {isFirstLastVideoMode
                  ? "首尾帧"
                  : isSmartStoryboardVideoMode
                    ? "智能分镜"
                    : isMultiShotVideoMode
                      ? "自定义多镜头"
                      : "参考生成"}
              </div>
              <div className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {draftVideoSettings.durationSec}s
              </div>
              <div className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {draftVideoSettings.withAudio ? "带声音" : "静音视频"}
              </div>
              {selectedVideoOutputSource ? (
                <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                  若供应商限制直下，点击“原链接”可直接打开源视频
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>

      <Dialog open={isVideoPreviewOpen} onOpenChange={setIsVideoPreviewOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[28px] border border-black/5 p-0 sm:max-w-6xl" showCloseButton>
          <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[24px] bg-white">
            <DialogHeader className="px-6 py-5">
              <DialogTitle className="text-lg">{selectedNode.title || "视频预览"}</DialogTitle>
              <DialogDescription>放大查看当前视频节点结果，并可直接下载。</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-auto px-6 pb-6">
              <div className="overflow-hidden rounded-[24px] border bg-black">
                {selectedVideoOutputSource ? (
                  <div className="relative mx-auto w-full" style={{ aspectRatio: `${resolvedVideoAspectRatio}` }}>
                    <video
                      className="h-full w-full object-contain"
                      controls
                      playsInline
                      preload="metadata"
                      src={selectedVideoOutputSource}
                      onLoadedMetadata={(event) => {
                        const { videoWidth, videoHeight } = event.currentTarget;

                        if (videoWidth > 0 && videoHeight > 0) {
                          setVideoPreviewAspectRatio(videoWidth / videoHeight);
                        }
                      }}
                    />
                    <div className="absolute right-4 top-4 z-10">
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => window.open(selectedVideoOutputSource, "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="mr-1 size-4" />
                          原链接
                        </Button>
                        <Button type="button" variant="secondary" onClick={onDownloadVideo}>
                          <Download className="mr-1 size-4" />
                          下载当前结果
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : previewFallbackAsset ? (
                  <div className="relative">
                    <img alt={previewFallbackAsset.fileName} className="max-h-[70vh] w-full object-contain" src={previewFallbackAsset.fileUrl} />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                      <div className="rounded-full bg-background/90 px-3 py-1 text-xs text-foreground shadow-sm">
                        当前还没有视频结果，正在预览参考图
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[420px] items-center justify-center text-sm text-white/80">
                    当前还没有可放大的视频结果
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">当前比例：{resolvedVideoAspectLabel}</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ExpandedTextEditorProps = {
  selectedNode: CanvasNode;
  expandedTextContent: string;
  isSavingPrompt: boolean;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ExpandedTextEditor({
  selectedNode,
  expandedTextContent,
  isSavingPrompt,
  onContentChange,
  onClose,
  onSave,
}: ExpandedTextEditorProps) {
  const isStoryboardNode = selectedNode.type === "storyboard";

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
      <div className="mx-auto my-6 flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="flex max-h-[calc(100vh-4rem)] w-full flex-col rounded-[32px] border bg-background p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">{selectedNode.title}</p>
              <p className="text-sm text-muted-foreground">
                {isStoryboardNode ? "这里是分镜节点 JSON 输出编辑区，可手工修正最终结构化结果。" : "这里是文本节点正文编辑区，双击节点后直接进入，用于手工编辑最终内容。"}
              </p>
            </div>
            <Button size="sm" type="button" variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>

          <Textarea
            className="min-h-[48vh] flex-1 resize-none overflow-y-auto rounded-[28px] text-lg leading-8"
            placeholder="输入内容…"
            value={expandedTextContent}
            onChange={(event) => onContentChange(event.target.value)}
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isStoryboardNode ? "这里保存的是分镜 JSON 输出，不是 AI 提示词。" : "这里保存的是文本节点正文，不是 AI 提示词。"}
            </p>
            <div className="flex items-center gap-2">
              <Button disabled={isSavingPrompt} type="button" variant="outline" onClick={onSave}>
                {isSavingPrompt ? "保存中..." : "保存内容"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type BatchRunResultsPanelProps = {
  workspaceId: string;
  canvasId: string;
  batchRuns: CanvasBatchRunSummary[];
  activeBatchRunId: string | null;
  activeBatchRunDetail: CanvasBatchRunDetail | null;
  filteredBySelection: boolean;
  selectedNodeCount: number;
  currentPage: number;
  totalPages: number;
  paginatedRuns: CanvasBatchRunResult[];
  currentFilter: "all" | "succeeded" | "failed";
  isLoadingRuns: boolean;
  onSelectBatchRun: (batchRunId: string) => void;
  onChangeFilter: (filter: "all" | "succeeded" | "failed") => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onDownloadRun: (run: CanvasBatchRunResult) => void;
  onRetryItem: (batchRunId: string, itemId: string) => void;
  onExtractResult: (resultNodeId: string, run: CanvasBatchRunResult | CanvasBatchRunResultIndex) => void;
  onClose: () => void;
};

function batchActionLinkClass(primary: boolean) {
  return primary
    ? "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
    : "inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted";
}

function statusTone(status: string) {
  if (status === "failed" || status === "partial_failed") {
    return "bg-[#fff1f1] text-[#b42318]";
  }

  if (status === "processing" || status === "queued") {
    return "bg-[#f5f7ff] text-[#344054]";
  }

  if (status === "succeeded") {
    return "bg-[#f2f8f3] text-[#166534]";
  }

  return "bg-[#f4f4f5] text-[#52525b]";
}

function getRunStatusLabel(status: string) {
  if (status === "queued") {
    return "排队中";
  }

  if (status === "processing") {
    return "处理中";
  }

  if (status === "succeeded") {
    return "已成功";
  }

  if (status === "failed") {
    return "已失败";
  }

  return status;
}

function getRunPreviewKind(run: CanvasBatchRunResult) {
  if (run.assetMimeType?.startsWith("image/") || run.resultType === "image") {
    return "image";
  }

  if (run.assetMimeType?.startsWith("video/") || run.resultType === "video") {
    return "video";
  }

  if (run.assetMimeType?.startsWith("audio/") || run.resultType === "audio") {
    return "audio";
  }

  if (run.resultType === "json") {
    return "json";
  }

  return "text";
}

function getRunMeta(run: CanvasBatchRunResult) {
  if (run.finishedAt) {
    return `完成于 ${formatCanvasDateTime(run.finishedAt)}`;
  }

  if (run.startedAt) {
    return `开始于 ${formatCanvasDateTime(run.startedAt)}`;
  }

  return `创建于 ${formatCanvasDateTime(run.createdAt)}`;
}

function getCombinationItemMeta(item: CanvasBatchRunCombinationItem) {
  if (item.finishedAt) {
    return `完成于 ${formatCanvasDateTime(item.finishedAt)}`;
  }

  if (item.startedAt) {
    return `开始于 ${formatCanvasDateTime(item.startedAt)}`;
  }

  return `创建于 ${formatCanvasDateTime(item.createdAt)}`;
}

export function BatchRunResultsPanel({
  workspaceId,
  canvasId,
  batchRuns,
  activeBatchRunId,
  activeBatchRunDetail,
  filteredBySelection,
  selectedNodeCount,
  currentPage,
  totalPages,
  paginatedRuns,
  currentFilter,
  isLoadingRuns,
  onSelectBatchRun,
  onChangeFilter,
  onPreviousPage,
  onNextPage,
  onDownloadRun,
  onRetryItem,
  onExtractResult,
  onClose,
}: BatchRunResultsPanelProps) {
  const activeBatchRun = batchRuns.find((batchRun) => batchRun.id === activeBatchRunId) ?? batchRuns[0] ?? null;
  const isPlanBatchRun = Boolean(activeBatchRunDetail?.itemsPage);
  const paginatedCombinationItems = activeBatchRunDetail?.itemsPage?.items ?? [];

  if (!activeBatchRun) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex justify-end">
      <div className="pointer-events-auto w-[min(420px,calc(100vw-3rem))] overflow-hidden rounded-[28px] border bg-background/96 shadow-lg backdrop-blur">
        <div className="border-b px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">批量结果</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredBySelection
                  ? selectedNodeCount > 1
                    ? `已按当前选中的 ${selectedNodeCount} 个节点筛选结果。`
                    : "已按当前节点筛选结果。"
                  : "展示当前画布最近批量运行结果。"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                className={batchActionLinkClass(false)}
                href={`/tasks?workspaceId=${workspaceId}&tab=batches&detailType=batch&detailId=${activeBatchRun.id}`}
              >
                任务中心
              </a>
              <button className={batchActionLinkClass(false)} type="button" onClick={onClose}>
                关闭
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {batchRuns.map((batchRun) => {
              const isActive = batchRun.id === activeBatchRun.id;

              return (
                <button
                  key={batchRun.id}
                  className={`min-w-[196px] rounded-[18px] border px-3 py-3 text-left transition ${
                    isActive ? "border-primary/20 bg-primary/5" : "border-black/5 bg-[#fcfcfd] hover:border-black/10"
                  }`}
                  type="button"
                  onClick={() => onSelectBatchRun(batchRun.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${statusTone(batchRun.status)}`}>
                      {batchRun.status === "partial_failed" ? "部分失败" : getRunStatusLabel(batchRun.status)}
                    </span>
                    <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                      {batchRun.requestedRunCount} 轮
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-medium text-foreground">{getCanvasBatchRunTitle(batchRun)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatCanvasDateTime(batchRun.createdAt)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-4 py-4">
          <div className="rounded-[22px] border border-black/5 bg-[#fcfcfd] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(activeBatchRun.status)}`}>
                {activeBatchRun.status === "partial_failed" ? "部分失败" : getRunStatusLabel(activeBatchRun.status)}
              </span>
              <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs text-muted-foreground">
                {activeBatchRun.mode === "single_node" ? "单节点批量" : "多节点成组"}
              </span>
            </div>

            <div className="mt-3 space-y-1">
              <p className="text-sm font-medium text-foreground">{getCanvasBatchRunTitle(activeBatchRun)}</p>
              <p className="text-xs text-muted-foreground">
                节点执行 {activeBatchRun.completedNodeRunCount} / {activeBatchRun.totalNodeRunCount} · 成功{" "}
                {activeBatchRun.succeededNodeRunCount} · 失败 {activeBatchRun.failedNodeRunCount}
              </p>
            </div>

            {activeBatchRun.combinationPlanSummary ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                  组合模式 {activeBatchRun.combinationPlanSummary.mode}
                </span>
                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                  输入源 {activeBatchRun.combinationPlanSummary.inputSourceCount}
                </span>
                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                  预计组合 {activeBatchRun.combinationPlanSummary.estimatedCombinationCount}
                </span>
                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                  治理信号 {activeBatchRun.combinationPlanSummary.governanceSignals.length}
                </span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className={batchActionLinkClass(true)}
                href={`/api/tasks/batch-runs/${activeBatchRun.id}/download?workspaceId=${workspaceId}`}
              >
                批量下载
              </a>
              <a
                className={batchActionLinkClass(false)}
                href={`/canvases/${canvasId}?workspaceId=${workspaceId}`}
              >
                刷新画布
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">结果预览</p>
                <p className="text-xs text-muted-foreground">
                  {isPlanBatchRun ? "按组合实例分页查看结果索引，并执行单实例操作。" : "按分页查看当前批量输出，并直接下载单条结果。"}
                </p>
              </div>
              <div className="rounded-full border border-black/8 bg-[#fcfcfd] px-2.5 py-1 text-xs text-muted-foreground">
                第 {currentPage} / {Math.max(totalPages, 1)} 页
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[
                {
                  key: "all",
                  label: "全部",
                  count: isPlanBatchRun ? activeBatchRunDetail?.itemsPage?.total ?? 0 : activeBatchRun.totalNodeRunCount,
                },
                {
                  key: "succeeded",
                  label: "成功",
                  count: isPlanBatchRun ? activeBatchRun.succeededCombinationCount ?? 0 : activeBatchRun.succeededNodeRunCount,
                },
                {
                  key: "failed",
                  label: "失败",
                  count: isPlanBatchRun ? activeBatchRun.failedCombinationCount ?? 0 : activeBatchRun.failedNodeRunCount,
                },
              ].map((item) => (
                <button
                  key={item.key}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    currentFilter === item.key ? "border-primary/20 bg-primary/5 text-foreground" : "bg-[#fcfcfd] text-muted-foreground"
                  }`}
                  type="button"
                  onClick={() => onChangeFilter(item.key as "all" | "succeeded" | "failed")}
                >
                  {item.label} {item.count}
                </button>
              ))}
            </div>

            {isLoadingRuns ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-black/8 bg-[#fcfcfd] px-4 py-8 text-center text-sm text-muted-foreground">
                正在加载当前批量运行详情。
              </div>
            ) : isPlanBatchRun ? (
              paginatedCombinationItems.length === 0 ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-black/8 bg-[#fcfcfd] px-4 py-8 text-center text-sm text-muted-foreground">
                  当前筛选范围下还没有可预览的组合实例。
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {paginatedCombinationItems.map((item) => {
                    const primaryResult = getPrimaryBatchRunResultIndex(item);
                    const previewKind = primaryResult ? getRunPreviewKind(primaryResult) : "text";

                    return (
                      <div key={item.id} className="rounded-[18px] border border-black/5 bg-[#fcfcfd] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] ${statusTone(item.status)}`}>
                            {getRunStatusLabel(item.status)}
                          </span>
                          <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                            实例 #{item.itemIndex + 1}
                          </span>
                          <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                            索引 {item.resultIndexes.length}
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-medium text-foreground">{item.label || `组合实例 ${item.itemIndex + 1}`}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatBatchRunBindingSummary(item.bindingSummary)}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{getCombinationItemMeta(item)}</p>

                        {primaryResult?.status === "succeeded" && previewKind === "image" && primaryResult.assetFileUrl ? (
                          <div className="relative mt-3 h-48 overflow-hidden rounded-[18px] border border-black/5 bg-white">
                            <Image alt={primaryResult.nodeTitle} className="object-cover" fill sizes="420px" src={primaryResult.assetFileUrl} />
                          </div>
                        ) : null}

                        {primaryResult?.status === "succeeded" && previewKind === "video" && primaryResult.assetFileUrl ? (
                          <div className="mt-3 overflow-hidden rounded-[18px] border border-black/5 bg-white">
                            <video className="h-48 w-full object-cover" controls playsInline preload="metadata" src={primaryResult.assetFileUrl} />
                          </div>
                        ) : null}

                        {primaryResult?.status === "succeeded" && previewKind === "audio" && primaryResult.assetFileUrl ? (
                          <div className="mt-3 rounded-[18px] border border-black/5 bg-white p-3">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                              <AudioLines className="size-4" />
                              音频结果
                            </div>
                            <audio className="w-full" controls preload="metadata" src={primaryResult.assetFileUrl} />
                          </div>
                        ) : null}

                        {primaryResult?.status === "succeeded" && !primaryResult.assetFileUrl && primaryResult.contentText ? (
                          <div className="mt-3 rounded-[18px] border border-black/5 bg-white p-3">
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                              {previewKind === "json" ? <Clapperboard className="size-4" /> : <Type className="size-4" />}
                              {previewKind === "json" ? "JSON 结果" : "文本结果"}
                            </div>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                              {primaryResult.contentText}
                            </pre>
                          </div>
                        ) : null}

                        {item.status === "failed" ? (
                          <div className="mt-3 rounded-[18px] border border-[#f0c7c7] bg-[#fff6f6] px-3 py-3 text-xs leading-6 text-[#b42318]">
                            {item.lastErrorCode ? `${item.lastErrorCode} · ` : ""}
                            {item.lastErrorMessage || "当前组合实例失败，但没有返回额外错误信息。"}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button className={batchActionLinkClass(false)} type="button" onClick={() => onRetryItem(activeBatchRun.id, item.id)}>
                            重试实例
                          </button>
                          {activeBatchRun.resultNodeId && primaryResult ? (
                            <button
                              className={batchActionLinkClass(false)}
                              type="button"
                              onClick={() => onExtractResult(activeBatchRun.resultNodeId!, primaryResult)}
                            >
                              提取结果
                            </button>
                          ) : null}
                          <a
                            className={batchActionLinkClass(false)}
                            href={`/api/tasks/batch-runs/${activeBatchRun.id}/items/${item.id}/download?workspaceId=${workspaceId}`}
                          >
                            导出实例
                          </a>
                          {primaryResult?.requestId ? (
                            <span className="truncate rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                              {primaryResult.requestId}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : paginatedRuns.length === 0 ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-black/8 bg-[#fcfcfd] px-4 py-8 text-center text-sm text-muted-foreground">
                当前筛选范围下还没有可预览的结果。
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {paginatedRuns.map((run) => {
                  const previewKind = getRunPreviewKind(run);

                  return (
                    <div key={run.id} className="rounded-[18px] border border-black/5 bg-[#fcfcfd] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${statusTone(run.status)}`}>
                          {getRunStatusLabel(run.status)}
                        </span>
                        <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                          Run {run.runIndex ?? "—"}
                        </span>
                        <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                          {run.nodeTitle}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">{getRunMeta(run)}</p>

                      {run.status === "succeeded" && previewKind === "image" && run.assetFileUrl ? (
                        <div className="relative mt-3 h-48 overflow-hidden rounded-[18px] border border-black/5 bg-white">
                          <Image alt={run.nodeTitle} className="object-cover" fill sizes="420px" src={run.assetFileUrl} />
                        </div>
                      ) : null}

                      {run.status === "succeeded" && previewKind === "video" && run.assetFileUrl ? (
                        <div className="mt-3 overflow-hidden rounded-[18px] border border-black/5 bg-white">
                          <video className="h-48 w-full object-cover" controls playsInline preload="metadata" src={run.assetFileUrl} />
                        </div>
                      ) : null}

                      {run.status === "succeeded" && previewKind === "audio" && run.assetFileUrl ? (
                        <div className="mt-3 rounded-[18px] border border-black/5 bg-white p-3">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                            <AudioLines className="size-4" />
                            音频结果
                          </div>
                          <audio className="w-full" controls preload="metadata" src={run.assetFileUrl} />
                        </div>
                      ) : null}

                      {run.status === "succeeded" && !run.assetFileUrl ? (
                        <div className="mt-3 rounded-[18px] border border-black/5 bg-white p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                            {previewKind === "json" ? <Clapperboard className="size-4" /> : <Type className="size-4" />}
                            {previewKind === "json" ? "JSON 结果" : "文本结果"}
                          </div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                            {run.contentText || "当前结果没有可展示的正文内容。"}
                          </pre>
                        </div>
                      ) : null}

                      {run.status === "failed" ? (
                        <div className="mt-3 rounded-[18px] border border-[#f0c7c7] bg-[#fff6f6] px-3 py-3 text-xs leading-6 text-[#b42318]">
                          {run.errorCode ? `${run.errorCode} · ` : ""}
                          {run.errorMessage || "当前运行失败，但没有返回额外错误信息。"}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {run.status === "succeeded" ? (
                          <button
                            className={batchActionLinkClass(false)}
                            type="button"
                            onClick={() => onDownloadRun(run)}
                          >
                            <Download className="mr-1 size-4" />
                            下载结果
                          </button>
                        ) : null}

                        <div className="inline-flex items-center gap-1 rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                          {previewKind === "image" ? <ImageIcon className="size-3.5" /> : null}
                          {previewKind === "video" ? <Video className="size-3.5" /> : null}
                          {previewKind === "audio" ? <AudioLines className="size-3.5" /> : null}
                          {previewKind === "text" || previewKind === "json" ? <Type className="size-3.5" /> : null}
                          {run.resultType ?? "unknown"}
                        </div>

                        {run.requestId ? (
                          <span className="truncate rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {run.requestId}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                className={batchActionLinkClass(false)}
                disabled={currentPage <= 1}
                type="button"
                onClick={onPreviousPage}
              >
                <ChevronLeft className="mr-1 size-4" />
                上一页
              </button>
              <p className="text-xs text-muted-foreground">分页仅影响预览，不影响批量下载内容。</p>
              <button
                className={batchActionLinkClass(false)}
                disabled={currentPage >= totalPages}
                type="button"
                onClick={onNextPage}
              >
                下一页
                <ChevronRight className="ml-1 size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function getReferenceAssetDownloadName(asset: CanvasNodeReferenceAsset) {
  return `${asset.fileName.replace(/\.[^.]+$/, "")}.${inferImageExtension(asset.fileUrl, asset.mimeType)}`;
}
