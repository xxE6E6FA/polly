import type { Doc } from "@convex/_generated/dataModel";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ModelList } from "./ModelList";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

type Size = "sm" | "md";

export function ModelPickerTabs({
  activeTab,
  onActiveTabChange,
  modelGroups,
  onSelectTextModel,
  hasReachedPollyLimit,
  imageModels,
  selectedImageModelId,
  onSelectImageModel,
  size = "sm",
  autoFocusSearch,
}: {
  activeTab: "text" | "image";
  onActiveTabChange: (tab: "text" | "image") => void;
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  onSelectTextModel: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  imageModels: Array<{ modelId: string; name: string; description?: string }>;
  selectedImageModelId?: string;
  onSelectImageModel: (modelId: string) => void;
  size?: Size;
  autoFocusSearch?: boolean;
}) {
  const h = size === "sm" ? "h-9" : "h-10";
  const padX = size === "sm" ? "px-2.5" : "px-3";
  const padY = size === "sm" ? "py-2" : "py-2.5";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
      return;
    }
    const target = e.target as HTMLElement | null;
    const isInput = target?.tagName === "INPUT";
    const isTextarea = target?.tagName === "TEXTAREA";
    const isEditable = !!target?.isContentEditable;

    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

    if ((isInput || isTextarea || isEditable) && !hasModifier) {
      // If search input focused and empty, allow arrow toggle; otherwise, keep caret movement.
      if (isInput) {
        const inputEl = target as HTMLInputElement;
        const isEmpty = inputEl.value.trim().length === 0;
        if (!isEmpty) {
          return; // let caret move
        }
      } else {
        return;
      }
    }

    e.preventDefault();
    if (e.key === "ArrowLeft") {
      onActiveTabChange(activeTab === "image" ? "text" : "image");
    } else if (e.key === "ArrowRight") {
      onActiveTabChange(activeTab === "text" ? "image" : "text");
    }
  };
  return (
    <div
      className="flex h-full w-full min-h-0 flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Segmented control styled like Settings nav */}
      <div className="flex w-full flex-col flex-shrink-0">
        <div className="flex w-full border-b border-border/40">
          <button
            type="button"
            className={cn(
              "flex-1 whitespace-nowrap rounded-none text-xs font-medium transition-all duration-200",
              padX,
              padY,
              h,
              activeTab === "text"
                ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              activeTab === "text"
                ? "hover:from-primary hover:to-primary/90"
                : "",
              "border-r border-border/40 last:border-r-0",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            onClick={() => onActiveTabChange("text")}
          >
            Text
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 whitespace-nowrap rounded-none text-xs font-medium transition-all duration-200",
              padX,
              padY,
              h,
              activeTab === "image"
                ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              activeTab === "image"
                ? "hover:from-primary hover:to-primary/90"
                : "",
              "border-l border-border/40 first:border-l-0",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            onClick={() => onActiveTabChange("image")}
          >
            Images
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "text" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ModelList
            modelGroups={modelGroups}
            handleSelect={onSelectTextModel}
            hasReachedPollyLimit={hasReachedPollyLimit}
            autoFocusSearch={autoFocusSearch}
          />
        </div>
      ) : (
        <Command
          className={cn(
            "flex h-full min-h-0 flex-1 flex-col overflow-hidden",
            // Style the input wrapper to look like Settings search
            "[&_[cmdk-input-wrapper]]:sticky [&_[cmdk-input-wrapper]]:top-0 [&_[cmdk-input-wrapper]]:z-10 [&_[cmdk-input-wrapper]]:mx-0 [&_[cmdk-input-wrapper]]:mb-0 [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input-wrapper]]:rounded-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40",
            "[&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-1.5 [&_[cmdk-input-wrapper]]:gap-2 [&_[cmdk-input-wrapper]]:shadow-sm dark:[&_[cmdk-input-wrapper]]:bg-muted/20",
            // Tune the search icon and input sizing
            "[&_[cmdk-input-wrapper]_svg]:h-3.5 [&_[cmdk-input-wrapper]_svg]:w-3.5 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground",
            "[&_[cmdk-input]]:h-8 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:rounded-none [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-xs"
          )}
        >
          <CommandInput
            className="h-8 w-full rounded-none text-xs"
            placeholder="Search image models..."
            autoFocus={autoFocusSearch}
          />
          <CommandList className="max-h-[min(calc(100dvh-14rem),260px)] overflow-y-auto">
            <CommandEmpty>
              <div className="p-4 text-center">
                <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="mb-1 text-sm text-muted-foreground">
                  No models found
                </p>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your search terms
                </p>
              </div>
            </CommandEmpty>
            {imageModels.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No image models available
              </div>
            ) : (
              <CommandGroup className="p-0">
                {imageModels.map(m => (
                  <CommandItem
                    key={m.modelId}
                    value={`${m.name ?? m.modelId} ${m.modelId}`}
                    onSelect={() => onSelectImageModel(m.modelId)}
                    className={cn(
                      "cursor-pointer rounded-none px-3 py-2.5 text-xs transition-colors hover:bg-accent/60",
                      selectedImageModelId === m.modelId && "bg-accent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-xs truncate">
                        {m.name || m.modelId}
                      </div>
                      {m.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {m.description}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      )}
    </div>
  );
}
