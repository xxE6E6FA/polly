import {
  DeviceMobile,
  DeviceTabletCamera,
  FrameCorners,
  MagnifyingGlassIcon,
  MonitorPlay,
  Square,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PickerFooter,
  PickerOption,
  PickerOptionCompact,
  PickerSection,
} from "@/components/ui/picker-content";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useEnabledImageModels, useMediaQuery } from "@/hooks";
import { cn } from "@/lib";
import {
  ActionIcon,
  actionButtonStyles,
  DRAWER_ICON_SIZE,
} from "./action-button";

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square", icon: Square },
  { value: "16:9", label: "Landscape", icon: MonitorPlay },
  { value: "9:16", label: "Portrait", icon: DeviceMobile },
  { value: "4:3", label: "Standard", icon: FrameCorners },
  { value: "3:4", label: "Tall", icon: DeviceTabletCamera },
] as const;

export type AspectRatioValue = (typeof ASPECT_RATIOS)[number]["value"];

export interface ImageRetryParams {
  model: string;
  aspectRatio: AspectRatioValue;
}

interface ImageRetryPopoverProps {
  currentModel?: string;
  currentAspectRatio?: string;
  onRetry: (params: ImageRetryParams) => void;
  className?: string;
}

export function ImageRetryPopover({
  currentModel,
  currentAspectRatio = "1:1",
  onRetry,
  className,
}: ImageRetryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(currentModel || "");
  const [selectedAspectRatio, setSelectedAspectRatio] =
    useState<string>(currentAspectRatio);
  const [searchQuery, setSearchQuery] = useState("");

  const isDesktop = useMediaQuery("(min-width: 640px)");
  const imageModels = useEnabledImageModels() || [];

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return imageModels;
    }
    const query = searchQuery.toLowerCase();
    return imageModels.filter(
      model =>
        model.name?.toLowerCase().includes(query) ||
        model.modelId.toLowerCase().includes(query)
    );
  }, [imageModels, searchQuery]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSelectedModel(currentModel || "");
      setSelectedAspectRatio(currentAspectRatio);
      setSearchQuery("");
    }
    setOpen(isOpen);
  };

  const handleRetry = () => {
    if (!selectedModel) {
      return;
    }
    onRetry({
      model: selectedModel,
      aspectRatio: selectedAspectRatio as AspectRatioValue,
    });
    setOpen(false);
  };

  const selectedModelData = imageModels.find(m => m.modelId === selectedModel);
  const selectedRatio = ASPECT_RATIOS.find(
    r => r.value === selectedAspectRatio
  );

  const triggerContent = <ActionIcon.Retry />;

  return (
    <ResponsivePicker
      trigger={triggerContent}
      title="Retry Image Generation"
      tooltip="Retry with different settings"
      open={open}
      onOpenChange={handleOpenChange}
      pickerVariant="raw"
      size="none"
      contentClassName={isDesktop ? "w-80 p-0" : "stack-lg"}
      align="start"
      ariaLabel="Retry image generation"
      triggerClassName={cn(actionButtonStyles.defaultButton, className)}
    >
      {isDesktop ? (
        <DesktopContent
          imageModels={filteredModels}
          selectedModel={selectedModel}
          selectedAspectRatio={selectedAspectRatio}
          selectedModelData={selectedModelData}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onModelSelect={setSelectedModel}
          onAspectRatioSelect={setSelectedAspectRatio}
          onRetry={handleRetry}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <MobileContent
          imageModels={filteredModels}
          selectedModel={selectedModel}
          selectedAspectRatio={selectedAspectRatio}
          selectedModelData={selectedModelData}
          selectedRatio={selectedRatio}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onModelSelect={setSelectedModel}
          onAspectRatioSelect={setSelectedAspectRatio}
          onRetry={handleRetry}
          onCancel={() => setOpen(false)}
        />
      )}
    </ResponsivePicker>
  );
}

interface ContentProps {
  imageModels: Array<{
    modelId: string;
    name?: string;
    provider?: string;
  }>;
  selectedModel: string;
  selectedAspectRatio: string;
  selectedModelData?: { modelId: string; name?: string; provider?: string };
  selectedRatio?: (typeof ASPECT_RATIOS)[number];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onModelSelect: (model: string) => void;
  onAspectRatioSelect: (ratio: string) => void;
  onRetry: () => void;
  onCancel: () => void;
}

function DesktopContent({
  imageModels,
  selectedModel,
  selectedAspectRatio,
  searchQuery,
  onSearchChange,
  onModelSelect,
  onAspectRatioSelect,
  onRetry,
  onCancel,
}: ContentProps) {
  return (
    <>
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Model list with scroll and fade mask */}
      <div
        className="max-h-[200px] overflow-y-auto"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)",
        }}
      >
        <PickerSection label="Model">
          {imageModels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No models found
            </div>
          ) : (
            imageModels.map(model => (
              <PickerOption
                key={model.modelId}
                label={model.name || model.modelId}
                icon={
                  <ProviderIcon
                    provider={model.provider || "replicate"}
                    className="h-4 w-4"
                  />
                }
                selected={selectedModel === model.modelId}
                onClick={() => onModelSelect(model.modelId)}
              />
            ))
          )}
        </PickerSection>
      </div>

      <PickerSection label="Aspect Ratio" bordered>
        {ASPECT_RATIOS.map(ratio => (
          <PickerOptionCompact
            key={ratio.value}
            label={ratio.label}
            icon={<ratio.icon size={14} />}
            suffix={ratio.value}
            selected={selectedAspectRatio === ratio.value}
            onClick={() => onAspectRatioSelect(ratio.value)}
          />
        ))}
      </PickerSection>

      <PickerFooter className="gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onRetry} disabled={!selectedModel}>
          <ActionIcon.Retry className="mr-1.5" />
          Retry
        </Button>
      </PickerFooter>
    </>
  );
}

function MobileContent({
  imageModels,
  selectedModel,
  selectedAspectRatio,
  searchQuery,
  onSearchChange,
  onModelSelect,
  onAspectRatioSelect,
  onRetry,
  onCancel,
}: ContentProps) {
  return (
    <div className="stack-lg">
      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="stack-sm">
        <div className="text-xs font-medium text-muted-foreground px-2">
          Model
        </div>
        <div
          className="stack-xs max-h-[40vh] overflow-y-auto"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)",
          }}
        >
          {imageModels.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No models found
            </div>
          ) : (
            imageModels.map(model => (
              <button
                key={model.modelId}
                type="button"
                onClick={() => onModelSelect(model.modelId)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  selectedModel === model.modelId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <ProviderIcon
                  provider={model.provider || "replicate"}
                  className={DRAWER_ICON_SIZE}
                />
                <span className="text-sm font-medium">
                  {model.name || model.modelId}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="stack-sm">
        <div className="text-xs font-medium text-muted-foreground px-2">
          Aspect Ratio
        </div>
        <div className="stack-xs">
          {ASPECT_RATIOS.map(ratio => {
            const Icon = ratio.icon;
            const isSelected = selectedAspectRatio === ratio.value;

            return (
              <button
                key={ratio.value}
                type="button"
                onClick={() => onAspectRatioSelect(ratio.value)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
                  isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={DRAWER_ICON_SIZE} />
                  <span className="text-sm font-medium">{ratio.label}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {ratio.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={onRetry} disabled={!selectedModel}>
          <ActionIcon.Retry className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  );
}
