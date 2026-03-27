"use client";

import Image from "next/image";
import { AudioLines, ChevronLeft, ChevronRight, Clapperboard, Download, Expand, ImageIcon, Sparkles, Type, Upload, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  formatCanvasDateTime,
  DEFAULT_STORYBOARD_NODE_SETTINGS,
  DEFAULT_VIDEO_NODE_SETTINGS,
  clampNumber,
  getCanvasBatchRunTitle,
  inferImageExtension,
  getStoryboardShotAssetNames,
  type CanvasBatchRunDetail,
  type CanvasBatchRunResult,
  type CanvasNode,
  type CanvasNodeReferenceAsset,
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
    value: "kling-v3-omni-pro",
    label: "Kling V3 Omni Pro",
  },
  {
    value: "kling-v3-omni-standard",
    label: "Kling V3 Omni Standard",
  },
  {
    value: "kling-3.0",
    label: "Kling 3.0",
  },
] as const;

type TextNodePanelProps = {
  selectedNode: CanvasNode;
  canGenerate: boolean;
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
                    : "AI 生成内容"}
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
};

export function StoryboardNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
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
              这里会按 shotOutFormat 模板输出结构化分镜 JSON，上游文本会自动拼进 prompt，连入图片时会优先使用图片节点里的文本描述来提炼资产。
            </p>
          </div>
          <div className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            模板 · {draftSettings.templateFile}
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-3 py-3">
          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <Textarea
              className="min-h-32 max-h-48 max-w-full resize-y rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2"
              placeholder="输入故事梗概、角色、场景、节奏、镜头风格和关键动作，系统会自动生成连续分镜。"
              value={draftPrompt}
              onChange={(event) => onPromptChange(event.target.value)}
            />

            <div className="grid min-w-0 gap-3">
              <div className="grid min-w-0 gap-3 rounded-2xl bg-muted/25 p-3 md:grid-cols-2">
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

              <div className="grid gap-3 md:grid-cols-4">
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
                输出格式固定为 JSON，字段结构来自模板文件，videoPrompt 会强制保持英文。生成完成后可以直接创建分镜视频节点，并自动继承已连接的图片节点。
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
                  : " · 生成结果会作为结构化 JSON 回写到节点。"}
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
                {isGenerating ? "提交中..." : isTaskActive ? "生成中..." : "AI 生成分镜"}
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
  onDownloadReferenceAsset: (asset: CanvasNodeReferenceAsset) => void;
  onRemoveReferenceImage: (assetId: string) => void;
};

export function ImageNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
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
  onDownloadReferenceAsset,
  onRemoveReferenceImage,
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
                onClick={onDownloadImage}
              >
                <Download className="mr-1 size-4" />
                下载图片
              </Button>
            </div>
          </div>

          <Textarea
            className="min-h-28 resize-none rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2"
            placeholder="描述你想生成的画面风格、主体、场景，也可以先上传参考图再做图生图"
            value={draftImagePrompt}
            onChange={(event) => onPromptChange(event.target.value)}
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
                {isGenerating ? "提交中..." : isTaskActive ? "生成中..." : "AI 生成图片"}
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
};

export function VideoNodePanel({
  selectedNode,
  canEdit,
  canGenerate,
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
}: VideoNodePanelProps) {
  const isReferenceVideoMode = draftVideoSettings.generationMode === "reference";
  const isFirstLastVideoMode = draftVideoSettings.generationMode === "first_last";
  const isMultiShotVideoMode = draftVideoSettings.generationMode === "multi_shot";
  const hasPresetVideoModel = VIDEO_MODEL_PRESET_OPTIONS.some((option) => option.value === draftVideoModelKey);
  const selectedVideoModelPreset = draftVideoModelKey.length === 0 || hasPresetVideoModel ? draftVideoModelKey : "__custom__";

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="w-full max-w-6xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
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

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedNode.title}</p>
              <p className="text-xs text-muted-foreground">
                {isFirstLastVideoMode
                  ? "当前为首尾帧模式；上游文本会进入 prompt，上游图片会补充为参考图。"
                  : isMultiShotVideoMode
                    ? "当前为多镜头模式；上游文本会进入 prompt，上游图片会补充为参考图。"
                    : "当前为参考生成模式；上游文本会进入 prompt，上游图片会补充为参考图。"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isMultiShotVideoMode ? (
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
              <Button
                disabled={!selectedVideoOutputSource}
                size="sm"
                type="button"
                variant="outline"
                onClick={onDownloadVideo}
              >
                <Download className="mr-1 size-4" />
                下载视频
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <Textarea
              className="min-h-32 resize-none rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2"
              placeholder="描述视频内容、镜头语言、运动方式、主体和节奏，也可以结合首尾帧或参考图生成"
              value={draftVideoPrompt}
              onChange={(event) => onPromptChange(event.target.value)}
            />

            <div className="grid gap-3 rounded-2xl bg-muted/25 p-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>视频模型</span>
                <select
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
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
                  value={draftVideoSettings.generationMode}
                  onChange={(event) =>
                    onSettingsChange((current) => ({
                      ...current,
                      generationMode: event.target.value as VideoGenerationMode,
                    }))
                  }
                >
                  <option value="reference">参考生成</option>
                  <option value="first_last">首尾帧视频</option>
                  <option value="multi_shot">多镜头模式</option>
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
                : isMultiShotVideoMode
                  ? `已配置 ${draftVideoSettings.shotPrompts.length} 个镜头`
                  : `已关联 ${selectedVideoReferenceAssets.length} 张参考图`}
              {draftVideoModelKey.trim() ? ` · 当前模型 ${draftVideoModelKey.trim()}` : " · 当前使用默认视频模型"}
              {draftVideoSettings.withAudio ? " · 将请求带声音视频" : " · 当前请求静音视频"}
              {selectedVideoOutputSource ? " · 结果会直接显示在视频节点上。" : "。"}
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
                {isGenerating ? "提交中..." : isTaskActive ? "生成中..." : "AI 生成视频"}
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
      </div>
    </div>
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
  batchRuns: CanvasBatchRunDetail[];
  activeBatchRunId: string | null;
  filteredBySelection: boolean;
  selectedNodeCount: number;
  currentPage: number;
  totalPages: number;
  paginatedRuns: CanvasBatchRunResult[];
  onSelectBatchRun: (batchRunId: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onDownloadRun: (run: CanvasBatchRunResult) => void;
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

export function BatchRunResultsPanel({
  workspaceId,
  canvasId,
  batchRuns,
  activeBatchRunId,
  filteredBySelection,
  selectedNodeCount,
  currentPage,
  totalPages,
  paginatedRuns,
  onSelectBatchRun,
  onPreviousPage,
  onNextPage,
  onDownloadRun,
  onClose,
}: BatchRunResultsPanelProps) {
  const activeBatchRun = batchRuns.find((batchRun) => batchRun.id === activeBatchRunId) ?? batchRuns[0] ?? null;

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
                <p className="text-xs text-muted-foreground">按分页查看当前批量输出，并直接下载单条结果。</p>
              </div>
              <div className="rounded-full border border-black/8 bg-[#fcfcfd] px-2.5 py-1 text-xs text-muted-foreground">
                第 {currentPage} / {Math.max(totalPages, 1)} 页
              </div>
            </div>

            {paginatedRuns.length === 0 ? (
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
