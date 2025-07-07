import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  useOptimisticItemUpdate,
  useOptimisticToggle,
  useOptimisticUpdate,
} from "./use-optimistic-updates";
import { useQueryUserId } from "./use-query-user-id";

const generateTempId = (prefix: string): string => {
  return `temp-${prefix}-${Math.random()
    .toString(36)
    .substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
};

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
      if (!(Array.isArray(currentData) && userId)) {
        return currentData;
      }

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
      }
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
    },
    invalidateQueries: ["userPersonaSettings"],
  });
}

/**
 * Optimistic hook for toggling personas globally enabled/disabled
 * Uses the simplified toggle pattern
 */
export function useOptimisticPersonasGlobalToggle() {
  const userId = useQueryUserId();

  return useOptimisticUpdate<Doc<"userSettings"> | null, { enabled: boolean }>({
    convexMutation: api.userSettings.togglePersonasEnabled,
    queryKey: "userSettings",
    optimisticUpdate: (variables, currentData) => {
      if (!userId) {
        return currentData;
      }

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
 * Uses the simplified item update pattern
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
      if (!userId) {
        return currentData;
      }

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

// Convenience hooks using the new patterns
export function useOptimisticBooleanToggle<
  TItem extends Record<string, unknown>,
>(
  convexMutation: Parameters<typeof useOptimisticToggle>[0]["convexMutation"],
  queryKey: string,
  itemId: string,
  toggleProperty: keyof TItem
) {
  return useOptimisticToggle<TItem>({
    convexMutation,
    queryKey,
    itemId,
    toggleProperty,
    invalidateQueries: [queryKey],
  });
}

export function useOptimisticSettingsUpdate<
  TItem extends Record<string, unknown>,
>(
  convexMutation: Parameters<
    typeof useOptimisticItemUpdate
  >[0]["convexMutation"],
  queryKey: string,
  itemId: string
) {
  return useOptimisticItemUpdate<TItem>({
    convexMutation,
    queryKey,
    itemId,
    invalidateQueries: [queryKey],
  });
}
