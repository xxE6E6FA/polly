import { api } from "@convex/_generated/api";
import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";

const ASPECT_RATIOS = [
  { value: "1:1", w: 20, h: 20 },
  { value: "16:9", w: 24, h: 14 },
  { value: "9:16", w: 14, h: 24 },
  { value: "4:3", w: 22, h: 17 },
  { value: "3:4", w: 17, h: 22 },
];

const RESOLUTION_PRESETS: {
  label: string;
  description: string;
  value: number;
}[] = [
  { label: "Standard", description: "1K resolution", value: 25 },
  { label: "High", description: "2K resolution", value: 50 },
  { label: "Ultra", description: "4K resolution", value: 100 },
];

// biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query
type ImageModel = any;

function extractOwner(modelId: string): string | null {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex > 0) {
    return modelId.slice(0, slashIndex);
  }
  return null;
}

export function CanvasGenerationForm() {
  const prompt = useCanvasStore(s => s.prompt);
  const setPrompt = useCanvasStore(s => s.setPrompt);
  const selectedModelIds = useCanvasStore(s => s.selectedModelIds);
  const toggleModel = useCanvasStore(s => s.toggleModel);
  const aspectRatio = useCanvasStore(s => s.aspectRatio);
  const setAspectRatio = useCanvasStore(s => s.setAspectRatio);
  const advancedParams = useCanvasStore(s => s.advancedParams);
  const setAdvancedParams = useCanvasStore(s => s.setAdvancedParams);

  const availableModels = useEnabledImageModels();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter out built-in free models (which are now disabled)
  // biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query
  const models = availableModels?.filter((m: any) => !(m.isBuiltIn && m.free));

  const filteredModels = models?.filter((model: ImageModel) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase();
    return (
      model.name?.toLowerCase().includes(q) ||
      model.modelId?.toLowerCase().includes(q)
    );
  });

  const showSearch = models && models.length >= 5;

  const activeQuality = advancedParams.quality ?? 25;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      document.getElementById("canvas-generate-btn")?.click();
    }
  }, []);

  return (
    <div className="stack-md pb-2">
      {/* Prompt */}
      <div className="stack-xs">
        <label
          htmlFor="canvas-prompt"
          className="text-xs font-medium text-sidebar-muted"
        >
          Prompt
        </label>
        <textarea
          id="canvas-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the image you want to generate..."
          className="min-h-[100px] w-full resize-y rounded-lg border border-border/50 bg-sidebar-hover p-3 text-sm text-sidebar-foreground placeholder:text-sidebar-muted/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
          rows={4}
        />
      </div>

      {/* Model selection */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">
          Models
          {selectedModelIds.length > 0 && (
            <span className="ml-1 text-sidebar-foreground/70">
              · {selectedModelIds.length} selected
            </span>
          )}
        </span>
        {!models || models.length === 0 ? (
          <p className="text-xs text-sidebar-muted/70">
            No image models available. Add models in{" "}
            <a href="/settings/models/image" className="text-primary underline">
              Settings
            </a>
            .
          </p>
        ) : (
          <div className="stack-xs">
            {showSearch && (
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-muted/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className="w-full rounded-md border border-border/40 bg-sidebar-hover py-1.5 pl-7 pr-2.5 text-xs text-sidebar-foreground placeholder:text-sidebar-muted/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
            )}
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {/* biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query */}
              {filteredModels?.map((model: any) => {
                const isSelected = selectedModelIds.includes(model.modelId);
                const owner = extractOwner(model.modelId);
                return (
                  <button
                    key={model.modelId || model._id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-primary/10"
                        : "text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                    onClick={() => toggleModel(model.modelId)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-sidebar-foreground">
                        {model.name}
                      </div>
                      {(() => {
                        const subtitle = model.description || owner;
                        if (!subtitle) {
                          return null;
                        }
                        return (
                          <div className="truncate text-[11px] text-sidebar-muted/70">
                            {subtitle}
                          </div>
                        );
                      })()}
                    </div>
                    <div
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-sidebar-muted/40"
                      )}
                    >
                      {isSelected && (
                        <div className="size-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
              {filteredModels?.length === 0 && searchQuery.trim() && (
                <p className="px-2.5 py-1.5 text-xs text-sidebar-muted/70">
                  No models match "{searchQuery}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Aspect ratio */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">
          Aspect Ratio
        </span>
        <div className="flex gap-1.5">
          {ASPECT_RATIOS.map(ar => {
            const active = aspectRatio === ar.value;
            return (
              <button
                key={ar.value}
                type="button"
                className={cn(
                  "flex flex-1 flex-col items-center gap-1.5 rounded-lg py-2.5 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-hover text-sidebar-muted hover:text-sidebar-foreground"
                )}
                onClick={() => setAspectRatio(ar.value)}
              >
                <div className="flex h-6 items-center justify-center">
                  <div
                    className={cn(
                      "rounded-[3px] border-[1.5px]",
                      active
                        ? "border-primary-foreground"
                        : "border-sidebar-muted/50"
                    )}
                    style={{ width: ar.w, height: ar.h }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums">
                  {ar.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">
          Resolution
        </span>
        <div className="flex gap-1.5">
          {RESOLUTION_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-center transition-colors",
                activeQuality === preset.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-hover text-sidebar-muted hover:text-sidebar-foreground"
              )}
              onClick={() => setAdvancedParams({ quality: preset.value })}
            >
              <div className="text-xs font-medium">{preset.label}</div>
              <div className="text-[10px] opacity-70">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <CaretDownIcon
          className={cn(
            "size-3 transition-transform",
            showAdvanced && "rotate-180"
          )}
        />
        Advanced Settings
      </button>

      {showAdvanced && (
        <div className="stack-sm rounded-lg border border-border/40 p-3">
          {/* Steps */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-steps"
              className="text-xs text-sidebar-muted"
            >
              Steps
            </label>
            <input
              id="canvas-steps"
              type="number"
              min={1}
              max={100}
              value={advancedParams.steps ?? ""}
              onChange={e =>
                setAdvancedParams({
                  steps: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Auto"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Guidance */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-guidance"
              className="text-xs text-sidebar-muted"
            >
              Guidance Scale
            </label>
            <input
              id="canvas-guidance"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={advancedParams.guidanceScale ?? ""}
              onChange={e =>
                setAdvancedParams({
                  guidanceScale: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="Auto"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Seed */}
          <div className="stack-xs">
            <label htmlFor="canvas-seed" className="text-xs text-sidebar-muted">
              Seed
            </label>
            <input
              id="canvas-seed"
              type="number"
              min={0}
              value={advancedParams.seed ?? ""}
              onChange={e =>
                setAdvancedParams({
                  seed: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Random"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Negative prompt */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-neg-prompt"
              className="text-xs text-sidebar-muted"
            >
              Negative Prompt
            </label>
            <textarea
              id="canvas-neg-prompt"
              value={advancedParams.negativePrompt ?? ""}
              onChange={e =>
                setAdvancedParams({
                  negativePrompt: e.target.value || undefined,
                })
              }
              placeholder="Things to avoid..."
              className="w-full resize-y rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasGenerateButton() {
  const prompt = useCanvasStore(s => s.prompt);
  const selectedModelIds = useCanvasStore(s => s.selectedModelIds);
  const aspectRatio = useCanvasStore(s => s.aspectRatio);
  const advancedParams = useCanvasStore(s => s.advancedParams);
  const resetForm = useCanvasStore(s => s.resetForm);

  const startBatch = useAction(api.generations.startCanvasBatch);
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate =
    prompt.trim().length > 0 && selectedModelIds.length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) {
      return;
    }
    setIsGenerating(true);
    try {
      const batchId = crypto.randomUUID();
      await startBatch({
        prompt: prompt.trim(),
        modelIds: selectedModelIds,
        params: {
          aspectRatio,
          ...advancedParams,
        },
        batchId,
      });
      resetForm();
    } finally {
      setIsGenerating(false);
    }
  }, [
    canGenerate,
    prompt,
    selectedModelIds,
    aspectRatio,
    advancedParams,
    startBatch,
    resetForm,
  ]);

  return (
    <Button
      id="canvas-generate-btn"
      className="w-full gap-2"
      disabled={!canGenerate}
      onClick={handleGenerate}
    >
      <SparkleIcon className="size-4" />
      {isGenerating
        ? "Generating..."
        : `Generate${selectedModelIds.length > 1 ? ` · ${selectedModelIds.length} models` : ""}`}
    </Button>
  );
}
