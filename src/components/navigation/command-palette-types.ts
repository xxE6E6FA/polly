import type { Icon } from "@phosphor-icons/react";
import type { HydratedModel } from "@/types";

export type NavigationState = {
  currentMenu:
    | "main"
    | "conversation-actions"
    | "model-categories"
    | "conversation-browser"
    | "theme";
  selectedConversationId?: string;
  breadcrumb?: string;
};

export type ConversationType = {
  _id: string;
  title: string;
  isPinned: boolean;
  isArchived: boolean;
  _creationTime: number;
};

export type ModelType = HydratedModel;

/**
 * Minimal model shape used for display in command palette menus.
 * Accepts both HydratedModel and recentlyUsedModels return types.
 */
export type DisplayModel = {
  modelId: string;
  provider: string;
  name: string;
  contextLength?: number;
  free?: boolean;
  supportsReasoning?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
  supportsImageGeneration?: boolean;
  inputModalities?: string[];
};

export type Action = {
  id: string;
  label: string;
  icon: Icon;
  handler: () => void;
  disabled: boolean;
};
