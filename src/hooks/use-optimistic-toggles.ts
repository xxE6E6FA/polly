import { useOptimisticUpdate } from "./use-optimistic-updates";
import { api } from "../../convex/_generated/api";
import { type Doc, type Id } from "../../convex/_generated/dataModel";
import { useQueryUserId } from "./use-query-user-id";

// Utility function to generate temporary IDs using the same pattern as the codebase
const generateTempId = (prefix: string): string => {
  return `temp-${prefix}-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Optimistic hook for toggling model enabled/disabled state
 */
export function useOptimisticModelToggle() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<
    Doc<"userModels">[],
    { modelId: string; modelData?: Record<string, unknown> }
  >({
    convexMutation: api.userModels.toggleModel,
    queryKey: "userModels",
    optimisticUpdate: (variables, currentData) => {
      if (!Array.isArray(currentData)) return currentData;

      const existingModel = currentData.find(
        model => model.modelId === variables.modelId
      );

      if (existingModel) {
        // Remove the model (toggle off)
        return currentData.filter(model => model.modelId !== variables.modelId);
      } else if (variables.modelData && userId) {
        // Add the model (toggle on) - ensure all required fields are present
        const newModel: Doc<"userModels"> = {
          _id: generateTempId("usermodel") as Id<"userModels">,
          _creationTime: Date.now(),
          userId,
          modelId: variables.modelData.modelId as string,
          name: variables.modelData.name as string,
          provider: variables.modelData.provider as string,
          contextLength: variables.modelData.contextLength as number,
          maxOutputTokens: variables.modelData.maxOutputTokens as
            | number
            | undefined,
          supportsImages: variables.modelData.supportsImages as boolean,
          supportsTools: variables.modelData.supportsTools as boolean,
          supportsReasoning: variables.modelData.supportsReasoning as boolean,
          inputModalities: variables.modelData.inputModalities as
            | string[]
            | undefined,
          selected: false,
          free: variables.modelData.free as boolean | undefined,
          createdAt: Date.now(),
        };

        return [...currentData, newModel];
      }

      return currentData;
    },
    invalidateQueries: ["userModels", "userModelsByProvider"],
  });
}

/**
 * Optimistic hook for toggling built-in persona enabled/disabled state
 */
export function useOptimisticPersonaToggle() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<
    Doc<"userPersonaSettings">[],
    { personaId: Id<"personas">; isDisabled: boolean }
  >({
    convexMutation: api.personas.toggleBuiltInPersona,
    queryKey: "userPersonaSettings",
    optimisticUpdate: (variables, currentData) => {
      if (!Array.isArray(currentData) || !userId) return currentData;

      const existingSetting = currentData.find(
        setting => setting.personaId === variables.personaId
      );

      if (existingSetting) {
        // Update existing setting
        return currentData.map(setting =>
          setting.personaId === variables.personaId
            ? {
                ...setting,
                isDisabled: variables.isDisabled,
                updatedAt: Date.now(),
              }
            : setting
        );
      } else {
        // Create new setting with all required fields
        const newSetting: Doc<"userPersonaSettings"> = {
          _id: generateTempId("persona-setting") as Id<"userPersonaSettings">,
          _creationTime: Date.now(),
          userId,
          personaId: variables.personaId,
          isDisabled: variables.isDisabled,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        return [...currentData, newSetting];
      }
    },
    invalidateQueries: ["userPersonaSettings"],
  });
}

/**
 * Optimistic hook for toggling personas globally enabled/disabled
 */
export function useOptimisticPersonasGlobalToggle() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<Doc<"userSettings"> | null, { enabled: boolean }>({
    convexMutation: api.userSettings.togglePersonasEnabled,
    queryKey: "userSettings",
    optimisticUpdate: (variables, currentData) => {
      if (!userId) return currentData;

      if (!currentData) {
        // Create new settings if none exist with all required fields
        return {
          _id: generateTempId("settings") as Id<"userSettings">,
          _creationTime: Date.now(),
          userId,
          personasEnabled: variables.enabled,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as Doc<"userSettings">;
      }

      return {
        ...currentData,
        personasEnabled: variables.enabled,
        updatedAt: Date.now(),
      };
    },
    invalidateQueries: ["userSettings"],
  });
}

/**
 * Optimistic hook for updating user settings
 */
export function useOptimisticUserSettingsUpdate() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<
    Doc<"userSettings"> | null,
    {
      personasEnabled?: boolean;
      openRouterSorting?: "default" | "price" | "throughput" | "latency";
      anonymizeForDemo?: boolean;
      autoArchiveEnabled?: boolean;
      autoArchiveDays?: number;
    }
  >({
    convexMutation: api.userSettings.updateUserSettings,
    queryKey: "userSettings",
    optimisticUpdate: (variables, currentData) => {
      if (!userId) return currentData;

      if (!currentData) {
        // Create new settings if none exist with all required fields
        return {
          _id: generateTempId("settings") as Id<"userSettings">,
          _creationTime: Date.now(),
          userId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...variables,
        } as Doc<"userSettings">;
      }

      return {
        ...currentData,
        ...variables,
        updatedAt: Date.now(),
      };
    },
    invalidateQueries: ["userSettings"],
  });
}
