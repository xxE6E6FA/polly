import { api } from "@convex/_generated/api";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Backdrop } from "@/components/ui/backdrop";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useUserData } from "@/hooks/use-user-data";
import { useUserModels } from "@/hooks/use-user-models";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { AnonymousUserUpsell } from "./AnonymousUserUpsell";
import { ModelList } from "./ModelList";
import { ModelPickerTrigger } from "./ModelPickerTrigger";
import { NoModelsState } from "./NoModelsState";

type ModelPickerProps = {
  className?: string;
};

const ModelPickerComponent = ({ className }: ModelPickerProps) => {
  const [open, setOpen] = useState(false);
  const token = useAuthToken();
  const userData = useUserData();
  const user = userData?.user;
  const monthlyUsage = userData?.monthlyUsage ?? 0;
  const hasUnlimitedCalls = userData?.hasUnlimitedCalls ?? false;
  const { userModelsByProvider, hasUserModels } = useUserModels();
  const selectedModelRaw = usePersistentConvexQuery(
    "selected-model",
    api.userModels.getUserSelectedModel,
    {}
  );
  const selectModelMutation = useMutation(api.userModels.selectModel);

  // Apply type guards
  const selectedModel = isUserModel(selectedModelRaw) ? selectedModelRaw : null;

  const safeUserModelsByProvider = Array.isArray(userModelsByProvider)
    ? userModelsByProvider
    : [];

  const isAuthenticated = Boolean(token);

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
    async (modelId: string) => {
      setOpen(false);
      try {
        await selectModelMutation({ modelId });
      } catch (error) {
        console.error("Failed to select model:", error);
        toast.error("Failed to select model", {
          description: "Unable to change the selected model. Please try again.",
        });
      } finally {
        window.dispatchEvent(new CustomEvent("user-models-changed"));
      }
    },
    [selectModelMutation]
  );

  if (
    !isUserModel(selectedModelRaw) &&
    hasUserModels === undefined &&
    isAuthenticated
  ) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={className}>
            <ModelPickerTrigger
              open={open}
              selectedModel={selectedModel}
              hasReachedPollyLimit={false}
              isAuthenticated={false}
            />
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

  if (safeUserModelsByProvider.length === 0) {
    return <NoModelsState />;
  }

  return (
    <>
      {open && <Backdrop className="z-40" />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={className}>
            <ModelPickerTrigger
              open={open}
              selectedModel={selectedModel}
              hasReachedPollyLimit={hasReachedPollyLimit ?? false}
              isAuthenticated
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          avoidCollisions
          className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-lg"
          side="top"
          sideOffset={4}
        >
          <ModelList
            userModelsByProvider={safeUserModelsByProvider}
            handleSelect={handleSelect}
            hasReachedPollyLimit={hasReachedPollyLimit ?? false}
          />
        </PopoverContent>
      </Popover>
    </>
  );
};

export const ModelPicker = memo(ModelPickerComponent);
