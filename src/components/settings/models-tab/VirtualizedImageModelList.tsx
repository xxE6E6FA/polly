import { api } from "@convex/_generated/api";
import { TagIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useMemo } from "react";

import { ProviderIcon } from "@/components/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import type { FetchedImageModel } from "@/types";

const ImageModelCard = memo(
  ({
    model,
    isEnabled,
    onToggle,
    isPending,
  }: {
    model: FetchedImageModel;
    isEnabled: boolean;
    onToggle: (model: FetchedImageModel) => void;
    isPending: boolean;
  }) => {
    const handleToggle = useCallback(() => {
      onToggle(model);
    }, [model, onToggle]);

    return (
      <div
        className={cn(
          "group rounded-lg bg-card overflow-hidden transition-all duration-200 hover:shadow-sm ring-1 ring-border/30 motion-hover-lift",
          isEnabled &&
            "ring-1 ring-blue-500/30 bg-gradient-to-br from-blue-500/5 to-purple-500/5"
        )}
      >
        {/* Example Image with consistent aspect ratio */}
        <div className="relative aspect-[4/3] bg-muted/20">
          {model.coverImageUrl ||
          (model.exampleImages && model.exampleImages.length > 0) ? (
            <img
              src={model.coverImageUrl || model.exampleImages?.[0]}
              alt={`${model.name} example`}
              className="w-full h-full object-cover"
              onError={e => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="text-2xl mb-2">🖼️</div>
                <div className="text-xs">No preview</div>
              </div>
            </div>
          )}
        </div>

        {/* Model Information */}
        <div className="p-4 stack-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <ProviderIcon
                provider={model.provider}
                className="h-4 w-4 mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-medium leading-tight text-sm line-clamp-1">
                  {model.name}
                </h3>
                {model.owner && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    by {model.owner}
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
              className="shrink-0"
            />
          </div>

          {model.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {model.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {model.tags?.slice(0, 3).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="h-5 text-xs flex items-center gap-1"
              >
                <TagIcon className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
            {model.tags && model.tags.length > 3 && (
              <Badge variant="secondary" className="h-5 text-xs">
                +{model.tags.length - 3} more
              </Badge>
            )}
          </div>

          {model.modelVersion && (
            <div className="text-xs text-muted-foreground">
              <div className="truncate">
                Version: {model.modelVersion.slice(0, 8)}...
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ImageModelCard.displayName = "ImageModelCard";

interface VirtualizedImageModelListProps {
  models: FetchedImageModel[];
}

export const VirtualizedImageModelList = memo<VirtualizedImageModelListProps>(
  ({ models }) => {
    const { user } = useUserDataContext();
    const toggleImageModelMutation = useMutation(
      api.imageModels.toggleImageModel
    );

    const enabledImageModelsRaw = useQuery(
      api.imageModels.getUserImageModels,
      user?._id ? {} : undefined
    );

    const enabledImageModels = Array.isArray(enabledImageModelsRaw)
      ? enabledImageModelsRaw
      : [];

    const handleToggleModel = useCallback(
      async (model: FetchedImageModel) => {
        if (!user?._id) {
          return;
        }

        try {
          await toggleImageModelMutation({
            modelId: model.modelId,
            provider: model.provider,
            name: model.name,
            description: model.description,
            modelVersion: model.modelVersion,
            owner: model.owner,
            tags: model.tags,
            supportedAspectRatios: model.supportedAspectRatios,
            supportsUpscaling: model.supportsUpscaling,
            supportsInpainting: model.supportsInpainting,
            supportsOutpainting: model.supportsOutpainting,
            supportsImageToImage: model.supportsImageToImage,
            supportsMultipleImages: model.supportsMultipleImages,
          });
        } catch (error) {
          console.error("Failed to toggle image model:", error);
        }
      },
      [user?._id, toggleImageModelMutation]
    );

    const enabledModelIds = useMemo(() => {
      return enabledImageModels.map(model => model.modelId);
    }, [enabledImageModels]);

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {models.map(model => (
          <ImageModelCard
            key={`${model.provider}-${model.modelId}`}
            model={model}
            isEnabled={enabledModelIds.includes(model.modelId)}
            onToggle={handleToggleModel}
            isPending={false}
          />
        ))}
      </div>
    );
  }
);

VirtualizedImageModelList.displayName = "VirtualizedImageModelList";
