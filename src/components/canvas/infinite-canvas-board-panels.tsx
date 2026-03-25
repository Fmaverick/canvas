"use client";

import { Download, Expand, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  DEFAULT_VIDEO_NODE_SETTINGS,
  clampNumber,
  inferImageExtension,
  type CanvasNode,
  type CanvasNodeReferenceAsset,
  type VideoGenerationMode,
  type VideoNodeSettings,
} from "@/components/canvas/infinite-canvas-board.shared";

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
            <p className="text-xs text-muted-foreground">这里是给 AI 的输入区，生成结果会填进文本节点内容。</p>
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
              <p className="text-xs text-muted-foreground">这里是给 AI 的输入区，可直接出图，也可结合参考图重绘。</p>
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
  selectedVideoOutputSource: string | null;
  selectedVideoFirstFrameAsset: CanvasNodeReferenceAsset | null;
  selectedVideoLastFrameAsset: CanvasNodeReferenceAsset | null;
  selectedVideoReferenceAssets: CanvasNodeReferenceAsset[];
  isSavingVideoPrompt: boolean;
  isUploadingVideoImages: boolean;
  isGenerating: boolean;
  isTaskActive: boolean;
  onPromptChange: (value: string) => void;
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
  selectedVideoOutputSource,
  selectedVideoFirstFrameAsset,
  selectedVideoLastFrameAsset,
  selectedVideoReferenceAssets,
  isSavingVideoPrompt,
  isUploadingVideoImages,
  isGenerating,
  isTaskActive,
  onPromptChange,
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
                  ? "当前为首尾帧模式，仅展示首帧与末帧输入。"
                  : isMultiShotVideoMode
                    ? "当前为多镜头模式，仅展示镜头脚本输入。"
                    : "当前为参考生成模式，仅展示参考图输入。"}
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
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
      <div className="mx-auto my-6 flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="flex max-h-[calc(100vh-4rem)] w-full flex-col rounded-[32px] border bg-background p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">{selectedNode.title}</p>
              <p className="text-sm text-muted-foreground">这里是文本节点正文编辑区，双击节点后直接进入，用于手工编辑最终内容。</p>
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
            <p className="text-sm text-muted-foreground">这里保存的是文本节点正文，不是 AI 提示词。</p>
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

export function getReferenceAssetDownloadName(asset: CanvasNodeReferenceAsset) {
  return `${asset.fileName.replace(/\.[^.]+$/, "")}.${inferImageExtension(asset.fileUrl, asset.mimeType)}`;
}
