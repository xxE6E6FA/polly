import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Backdrop } from "@/components/ui/backdrop";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import { useModelSelection } from "@/lib/chat/use-model-selection";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

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
  const { modelGroups } = useModelSelection();
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectModelMutation = useMutation(api.userModels.selectModel);
  const managedToast = useToast();

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

      const selectedModelData = [
        ...modelGroups.freeModels,
        ...Object.values(modelGroups.providerModels).flat(),
      ].find(
        model => model?.modelId === modelId && model?.provider === provider
      );

      if (selectedModelData) {
        set(CACHE_KEYS.selectedModel, selectedModelData);
      }

      try {
        await selectModelMutation({ modelId, provider });
      } catch (_error) {
        managedToast.error("Failed to select model", {
          description: "Unable to change the selected model. Please try again.",
        });
      }
    },
    [selectModelMutation, modelGroups, managedToast.error]
  );

  const fallbackModel = useMemo(() => {
    if (selectedModel || user?.isAnonymous) {
      return null;
    }
    return get(CACHE_KEYS.selectedModel, null);
  }, [selectedModel, user?.isAnonymous]);

  const displayModel = selectedModel || fallbackModel;

  useEffect(() => {
    if (selectedModel && !user?.isAnonymous) {
      set(CACHE_KEYS.selectedModel, selectedModel);
    }
  }, [selectedModel, user?.isAnonymous]);

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
