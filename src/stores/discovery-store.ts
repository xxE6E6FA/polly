import type { Id } from "@convex/_generated/dataModel";
import { devtools } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

const MAX_CONTEXT_PROMPTS = 10;

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 400;
const DEFAULT_PANEL_WIDTH = 280;

function getInitialPanelWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_WIDTH;
  }
  const saved = get(CACHE_KEYS.discoveryPanelWidth, DEFAULT_PANEL_WIDTH);
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, saved));
}

function getInitialPanelVisible(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return get(CACHE_KEYS.discoveryPanelVisible, true);
}

export type DiscoveryReaction = "liked" | "disliked" | "saved" | null;

export type DiscoveryEntry = {
  generationId: Id<"generations">;
  prompt: string;
  imageUrl: string | null;
  aspectRatio: string;
  status: "pending" | "generating" | "succeeded" | "failed";
  reaction: DiscoveryReaction;
  explanation?: string;
};

export type DiscoveryStopResult = {
  unsaved: DiscoveryEntry[];
  sessionId: string;
};

export type DiscoveryHint = "remix" | "wilder" | "fresh" | null;

export type DiscoveryState = {
  isActive: boolean;
  sessionId: string;
  dbSessionId: Id<"discoverySessions"> | null;
  modelId: string;
  personaId: Id<"personas"> | null;
  aspectRatio: string;
  history: DiscoveryEntry[];
  currentIndex: number;
  likedPrompts: string[];
  dislikedPrompts: string[];
  isGenerating: boolean;
  seedPrompt: string;
  seedImageStorageId: Id<"_storage"> | null;
  hint: DiscoveryHint;

  // Panel state
  isPanelVisible: boolean;
  panelWidth: number;
  isResizing: boolean;

  // Actions
  start: (opts: {
    modelId?: string;
    personaId?: Id<"personas">;
    aspectRatio?: string;
    seedPrompt?: string;
    seedImageStorageId?: Id<"_storage">;
  }) => void;
  resume: (opts: {
    sessionId: string;
    dbSessionId: Id<"discoverySessions">;
    modelId: string;
    personaId?: Id<"personas">;
    aspectRatio: string;
    seedPrompt?: string;
    seedImageStorageId?: Id<"_storage">;
    history: DiscoveryEntry[];
    likedPrompts: string[];
    dislikedPrompts: string[];
  }) => void;
  setDbSessionId: (id: Id<"discoverySessions">) => void;
  stop: () => DiscoveryStopResult;
  addEntry: (entry: DiscoveryEntry) => void;
  updateEntry: (
    generationId: Id<"generations">,
    updates: Partial<Pick<DiscoveryEntry, "imageUrl" | "status">>
  ) => void;
  reactLike: () => void;
  reactDislike: () => void;
  reactRemix: () => void;
  reactWilder: () => void;
  reactFresh: () => void;
  saveCurrentToCollection: () => void;
  browseUp: () => void;
  browseDown: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;
  setIsResizing: (resizing: boolean) => void;
  resetPanelWidth: () => void;
};

type DiscoveryStoreApi = StoreApi<DiscoveryState>;

const INITIAL_STATE = {
  isActive: false,
  sessionId: "",
  dbSessionId: null as Id<"discoverySessions"> | null,
  modelId: "",
  personaId: null as Id<"personas"> | null,
  aspectRatio: "1:1",
  history: [] as DiscoveryEntry[],
  currentIndex: -1,
  likedPrompts: [] as string[],
  dislikedPrompts: [] as string[],
  isGenerating: false,
  hint: null as DiscoveryHint,
  seedPrompt: "",
  seedImageStorageId: null as Id<"_storage"> | null,
  isPanelVisible: getInitialPanelVisible(),
  panelWidth: getInitialPanelWidth(),
  isResizing: false,
};

function createDiscoveryState(
  set_: DiscoveryStoreApi["setState"],
  get_: DiscoveryStoreApi["getState"]
): DiscoveryState {
  return {
    ...INITIAL_STATE,

    start: opts => {
      set_({
        isActive: true,
        sessionId: crypto.randomUUID(),
        dbSessionId: null,
        modelId: opts.modelId ?? "",
        personaId: opts.personaId ?? null,
        aspectRatio: opts.aspectRatio ?? "1:1",
        seedPrompt: opts.seedPrompt ?? "",
        seedImageStorageId: opts.seedImageStorageId ?? null,
        history: [],
        currentIndex: -1,
        likedPrompts: [],
        dislikedPrompts: [],
        isGenerating: false,
        isPanelVisible: false,
      });
      set(CACHE_KEYS.discoveryPanelVisible, false);
    },

    resume: opts => {
      set_({
        isActive: true,
        sessionId: opts.sessionId,
        dbSessionId: opts.dbSessionId,
        modelId: opts.modelId,
        personaId: opts.personaId ?? null,
        aspectRatio: opts.aspectRatio,
        seedPrompt: opts.seedPrompt ?? "",
        seedImageStorageId: opts.seedImageStorageId ?? null,
        history: opts.history,
        currentIndex: opts.history.length > 0 ? opts.history.length - 1 : -1,
        likedPrompts: opts.likedPrompts,
        dislikedPrompts: opts.dislikedPrompts,
        isGenerating: false,
      });
    },

    setDbSessionId: id => {
      set_({ dbSessionId: id });
    },

    stop: () => {
      const { history, sessionId, isPanelVisible, panelWidth } = get_();
      const unsaved = history.filter(
        e => e.reaction !== "saved" && e.status === "succeeded"
      );
      set_({ ...INITIAL_STATE, isPanelVisible, panelWidth });
      return { unsaved, sessionId };
    },

    addEntry: entry => {
      const { history } = get_();
      set_({
        history: [...history, entry],
        currentIndex: history.length,
        isGenerating:
          entry.status === "pending" || entry.status === "generating",
        hint: null,
      });
    },

    updateEntry: (generationId, updates) => {
      const { history } = get_();
      set_({
        history: history.map(e =>
          e.generationId === generationId ? { ...e, ...updates } : e
        ),
        isGenerating: (() => {
          if (updates.status === "pending" || updates.status === "generating") {
            return true;
          }
          if (updates.status != null) {
            return false;
          }
          return get_().isGenerating;
        })(),
      });
    },

    reactLike: () => {
      const { history, currentIndex, likedPrompts, dislikedPrompts } = get_();
      const current = history[currentIndex];
      if (!current || current.reaction === "liked") {
        return;
      }

      const updatedHistory = history.map((e, i) =>
        i === currentIndex ? { ...e, reaction: "liked" as const } : e
      );
      const updatedLiked = [
        ...likedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        current.prompt,
      ];
      const updatedDisliked = dislikedPrompts.filter(p => p !== current.prompt);
      set_({
        history: updatedHistory,
        likedPrompts: updatedLiked,
        dislikedPrompts: updatedDisliked,
      });
    },

    reactDislike: () => {
      const { history, currentIndex, likedPrompts, dislikedPrompts } = get_();
      const current = history[currentIndex];
      if (!current || current.reaction === "disliked") {
        return;
      }

      const updatedHistory = history.map((e, i) =>
        i === currentIndex ? { ...e, reaction: "disliked" as const } : e
      );
      const updatedDisliked = [
        ...dislikedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        current.prompt,
      ];
      const updatedLiked = likedPrompts.filter(p => p !== current.prompt);
      set_({
        history: updatedHistory,
        dislikedPrompts: updatedDisliked,
        likedPrompts: updatedLiked,
      });
    },

    reactRemix: () => {
      const { history, currentIndex, likedPrompts, dislikedPrompts } = get_();
      const current = history[currentIndex];
      if (!current) {
        return;
      }

      const updatedHistory = history.map((e, i) =>
        i === currentIndex ? { ...e, reaction: "liked" as const } : e
      );
      const updatedLiked = [
        ...likedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        current.prompt,
      ];
      set_({
        history: updatedHistory,
        likedPrompts: updatedLiked,
        dislikedPrompts: dislikedPrompts.filter(p => p !== current.prompt),
        hint: "remix",
      });
    },

    reactWilder: () => {
      const { history, currentIndex, likedPrompts, dislikedPrompts } = get_();
      const current = history[currentIndex];
      if (!current) {
        return;
      }

      const updatedHistory = history.map((e, i) =>
        i === currentIndex ? { ...e, reaction: "liked" as const } : e
      );
      const updatedLiked = [
        ...likedPrompts.slice(-(MAX_CONTEXT_PROMPTS - 1)),
        current.prompt,
      ];
      set_({
        history: updatedHistory,
        likedPrompts: updatedLiked,
        dislikedPrompts: dislikedPrompts.filter(p => p !== current.prompt),
        hint: "wilder",
      });
    },

    reactFresh: () => {
      const { history, currentIndex } = get_();
      const current = history[currentIndex];
      if (!current) {
        return;
      }

      const updatedHistory = history.map((e, i) =>
        i === currentIndex ? { ...e, reaction: "disliked" as const } : e
      );
      set_({
        history: updatedHistory,
        likedPrompts: [],
        dislikedPrompts: [current.prompt],
        hint: "fresh",
      });
    },

    saveCurrentToCollection: () => {
      const { history, currentIndex } = get_();
      const current = history[currentIndex];
      if (!current) {
        return;
      }

      set_({
        history: history.map((e, i) =>
          i === currentIndex ? { ...e, reaction: "saved" as const } : e
        ),
      });
    },

    browseUp: () => {
      const { currentIndex } = get_();
      if (currentIndex > 0) {
        set_({ currentIndex: currentIndex - 1 });
      }
    },

    browseDown: () => {
      const { currentIndex, history } = get_();
      if (currentIndex < history.length - 1) {
        set_({ currentIndex: currentIndex + 1 });
      }
    },

    togglePanel: () => {
      const next = !get_().isPanelVisible;
      set_({ isPanelVisible: next });
      set(CACHE_KEYS.discoveryPanelVisible, next);
    },

    setPanelWidth: (width: number) => {
      const clamped = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, width)
      );
      set_({ panelWidth: clamped });
      set(CACHE_KEYS.discoveryPanelWidth, clamped);
    },

    setIsResizing: (resizing: boolean) => set_({ isResizing: resizing }),

    resetPanelWidth: () => {
      set_({ panelWidth: DEFAULT_PANEL_WIDTH });
      set(CACHE_KEYS.discoveryPanelWidth, DEFAULT_PANEL_WIDTH);
    },
  };
}

export const createDiscoveryStore = () =>
  createStore<DiscoveryState>()(
    devtools((s, g) => createDiscoveryState(s, g), {
      name: "DiscoveryStore",
    })
  );

const discoveryStoreApi: DiscoveryStoreApi = createDiscoveryStore();

type DiscoverySelector<T> = (state: DiscoveryState) => T;

function useDiscoveryStoreBase<T>(
  selector: DiscoverySelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    discoveryStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useDiscoveryStore = Object.assign(useDiscoveryStoreBase, {
  getState: () => discoveryStoreApi.getState(),
  setState: (
    partial:
      | DiscoveryState
      | Partial<DiscoveryState>
      | ((state: DiscoveryState) => DiscoveryState | Partial<DiscoveryState>),
    replace?: false
  ) => discoveryStoreApi.setState(partial, replace),
  subscribe: (...args: Parameters<DiscoveryStoreApi["subscribe"]>) =>
    discoveryStoreApi.subscribe(...args),
});
