import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useSelectModel } from "@/hooks/use-select-model";
import { CACHE_KEYS, get } from "@/lib/local-storage";

import { useUserDataContext } from "@/providers/user-data-context";

import { AnonymousUserUpsell } from "./AnonymousUserUpsell";
import { ModelList } from "./ModelList";
import { ModelPickerTrigger } from "./ModelPickerTrigger";

type ModelPickerProps = {
  className?: string;
};

const ModelPickerComponent = ({ className }: ModelPickerProps) => {
  const [open, setOpen] = useState(false);
  const { monthlyUsage, hasUnlimitedCalls, user } = useUserDataContext();
  const { modelGroups } = useModelCatalog();
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const { selectModel } = useSelectModel();

  const selectedModel = selectedModelRaw;

  const hasReachedPollyLimit = useMemo(
    () =>
      Boolean(
        user &&
          !user.isAnonymous &&
          monthlyUsage &&
          monthlyUsage.remainingMessages === 0 &&
          !hasUnlimitedCalls
      ),
    [user, monthlyUsage, hasUnlimitedCalls]
  );

  const handleSelect = useCallback(
    async (modelId: string, provider: string) => {
      setOpen(false);

      await selectModel(modelId, provider, [
        ...modelGroups.freeModels,
        ...Object.values(modelGroups.providerModels).flat(),
      ]);
    },
    [selectModel, modelGroups]
  );

  const fallbackModel = useMemo(() => {
    if (selectedModel || user?.isAnonymous) {
      return null;
    }
    return get(CACHE_KEYS.selectedModel, null);
  }, [selectedModel, user?.isAnonymous]);

  const displayModel = selectedModel || fallbackModel;

  // Selected model persistence is handled by the centralized selection hook

  if (user?.isAnonymous) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={className}>
            <ModelPickerTrigger open={open} selectedModel={displayModel} />
          </div>
        </PopoverTrigger>
        <PopoverContent
          avoidCollisions
          className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-lg"
          side="top"
          sideOffset={4}
        >
          <AnonymousUserUpsell />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={className}>
          <ModelPickerTrigger open={open} selectedModel={displayModel} />
        </div>
      </PopoverTrigger>
      <PopoverContent
        avoidCollisions
        className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-lg"
        side="top"
        sideOffset={4}
      >
        <ModelList
          modelGroups={modelGroups}
          handleSelect={handleSelect}
          hasReachedPollyLimit={hasReachedPollyLimit}
        />
      </PopoverContent>
    </Popover>
  );
};

export const ModelPicker = memo(ModelPickerComponent);
