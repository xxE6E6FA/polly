import { api } from "@convex/_generated/api";
import {
  GearIcon,
  ImageIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { memo, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";

interface ImageModelPickerProps {
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
  enabledImageModels?: ImageModel[];
}

interface ImageModel {
  modelId: string;
  name: string;
  description?: string;
}

export const ImageModelPicker = memo<ImageModelPickerProps>(
  ({
    model,
    onModelChange,
    disabled = false,
    className = "",
    enabledImageModels: enabledImageModelsProp,
  }) => {
    const [open, setOpen] = useState(false);
    const [customModel, setCustomModel] = useState("");

    const { user } = useUserDataContext();
    const shouldQuery = !enabledImageModelsProp && user?._id;
    const enabledImageModelsRaw = useQuery(
      api.imageModels.getUserImageModels,
      shouldQuery ? {} : "skip"
    );

    const enabledImageModels: ImageModel[] =
      enabledImageModelsProp && Array.isArray(enabledImageModelsProp)
        ? enabledImageModelsProp
        : Array.isArray(enabledImageModelsRaw)
          ? enabledImageModelsRaw
          : [];

    const handleModelSelect = useCallback(
      (selectedModel: string) => {
        onModelChange(selectedModel);
        setCustomModel("");
        setOpen(false);
      },
      [onModelChange]
    );

    const handleCustomModelChange = useCallback(
      (value: string) => {
        setCustomModel(value);
        onModelChange(value);
      },
      [onModelChange]
    );

    return (
      <div className={className}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              disabled={disabled}
              className={cn(
                "h-6 w-auto gap-1 px-1.5 py-0.5 text-xs font-medium sm:h-7 sm:gap-1.5 sm:px-2 sm:text-xs",
                "transition-all duration-200 rounded-md border-0 focus:ring-0 shadow-none",
                "bg-accent/40 dark:bg-accent/20 text-foreground/90"
              )}
            >
              <div className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3 text-current" />
                <span className="max-w-[120px] truncate font-medium">
                  {enabledImageModels.find(m => m.modelId === model)?.name ||
                    (model && model.length > 20
                      ? `${model.slice(0, 20)}...`
                      : model) ||
                    "Model"}
                </span>
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            forceMount
            data-debug-id="ImageModelPicker"
            className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-sm"
            side="top"
            sideOffset={4}
          >
            <Command className="pt-2">
              <CommandInput
                className="h-9"
                placeholder="Search image models..."
              />
              <CommandList className="max-h-[calc(100dvh-10rem)] sm:max-h-[350px]">
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

                {enabledImageModels.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="mb-2 text-sm text-muted-foreground">
                      No image models available
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Configure image models in Settings
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Your Models Group */}
                    {enabledImageModels.length > 0 && (
                      <CommandGroup>
                        <div className="flex items-center gap-2 px-2 py-1.5 opacity-75">
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            Your Models
                          </span>
                        </div>
                        {enabledImageModels.map(enabledModel => (
                          <CommandItem
                            key={enabledModel.modelId}
                            value={`${enabledModel.name} ${enabledModel.modelId} ${enabledModel.description || ""}`}
                            onSelect={() =>
                              handleModelSelect(enabledModel.modelId)
                            }
                            className={cn(
                              "cursor-pointer mx-2 rounded-md px-3 py-2.5",
                              model === enabledModel.modelId && "bg-accent"
                            )}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">
                                {enabledModel.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {enabledModel.description ||
                                  enabledModel.modelId}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {/* Settings and Custom Model Section */}
                    <CommandSeparator className="mx-2" />
                    <CommandGroup>
                      <Link
                        to={ROUTES.SETTINGS.IMAGE_MODELS}
                        onClick={() => setOpen(false)}
                      >
                        <CommandItem className="cursor-pointer mx-2 rounded-md px-3 py-2">
                          <div className="flex items-center gap-2">
                            <GearIcon className="h-3 w-3" />
                            <span className="text-xs">Manage Image Models</span>
                          </div>
                        </CommandItem>
                      </Link>
                    </CommandGroup>

                    {/* Custom Model Input */}
                    <div className="p-3 pt-2">
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                        Custom Model ID
                      </Label>
                      <Input
                        value={
                          customModel ||
                          (enabledImageModels.find(m => m.modelId === model)
                            ? ""
                            : model)
                        }
                        onChange={e => handleCustomModelChange(e.target.value)}
                        placeholder="e.g., user/model-name"
                        className="font-mono text-xs h-7"
                        onKeyDown={e => e.stopPropagation()}
                      />
                    </div>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

ImageModelPicker.displayName = "ImageModelPicker";
