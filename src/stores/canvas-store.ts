import type { Id } from "@convex/_generated/dataModel";
import { devtools } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

export type CanvasFilterMode = "all" | "canvas" | "conversations";

export type ReferenceImage = {
  storageId: Id<"_storage">;
  previewUrl: string;
};

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 380;

type CanvasSelections = {
  selectedModelIds: string[];
  aspectRatio: string;
  quality: number | undefined;
  filterMode: CanvasFilterMode;
};

export type CanvasState = {
  selectedModelIds: string[];
  prompt: string;
  aspectRatio: string;
  advancedParams: {
    steps?: number;
    guidanceScale?: number;
    seed?: number;
    negativePrompt?: string;
    count?: number;
    quality?: number;
  };
  filterMode: CanvasFilterMode;
  panelWidth: number;
  isResizing: boolean;
  isPanelVisible: boolean;
  selectedImageIds: Set<string>;
  referenceImages: ReferenceImage[];
  isGeneratingPrompt: boolean;
  promptModelId?: string;
  promptModelProvider?: string;
  promptPersonaId?: string;

  // Actions
  toggleModel: (modelId: string) => void;
  setSelectedModelIds: (ids: string[]) => void;
  setPrompt: (prompt: string) => void;
  setAspectRatio: (ratio: string) => void;
  setAdvancedParams: (params: Partial<CanvasState["advancedParams"]>) => void;
  setFilterMode: (mode: CanvasFilterMode) => void;
  setPanelWidth: (width: number) => void;
  setIsResizing: (resizing: boolean) => void;
  resetPanelWidth: () => void;
  resetForm: () => void;
  togglePanel: () => void;
  toggleImageSelection: (imageId: string) => void;
  clearImageSelection: () => void;
  addReferenceImage: (storageId: Id<"_storage">, previewUrl: string) => void;
  removeReferenceImage: (index: number) => void;
  clearReferenceImages: () => void;
  setIsGeneratingPrompt: (v: boolean) => void;
  setPromptModel: (modelId?: string, provider?: string) => void;
  setPromptPersonaId: (id?: string) => void;
};

type CanvasStoreApi = StoreApi<CanvasState>;

function getInitialPanelWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_WIDTH;
  }
  const saved = get(CACHE_KEYS.canvasPanelWidth, DEFAULT_PANEL_WIDTH);
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, saved));
}

function getInitialSelections(): Partial<CanvasSelections> {
  if (typeof window === "undefined") {
    return {};
  }
  return get<Partial<CanvasSelections>>(CACHE_KEYS.canvasSelections, {});
}

function getInitialPanelVisible(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return get(CACHE_KEYS.canvasPanelVisible, true);
}

function persistSelections(get_: CanvasStoreApi["getState"]) {
  const state = get_();
  const selections: CanvasSelections = {
    selectedModelIds: state.selectedModelIds,
    aspectRatio: state.aspectRatio,
    quality: state.advancedParams.quality,
    filterMode: state.filterMode,
  };
  set(CACHE_KEYS.canvasSelections, selections);
}

const savedSelections = getInitialSelections();

const INITIAL_STATE = {
  selectedModelIds: savedSelections.selectedModelIds ?? ([] as string[]),
  prompt: "",
  aspectRatio: savedSelections.aspectRatio ?? "1:1",
  advancedParams:
    savedSelections.quality !== undefined
      ? { quality: savedSelections.quality }
      : {},
  filterMode: savedSelections.filterMode ?? ("all" as CanvasFilterMode),
  panelWidth: getInitialPanelWidth(),
  isResizing: false,
  isPanelVisible: getInitialPanelVisible(),
  selectedImageIds: new Set<string>(),
  referenceImages: [] as ReferenceImage[],
  isGeneratingPrompt: false,
  promptModelId: undefined as string | undefined,
  promptModelProvider: undefined as string | undefined,
  promptPersonaId: undefined as string | undefined,
};

function createCanvasState(
  set_: CanvasStoreApi["setState"],
  get_: CanvasStoreApi["getState"]
): CanvasState {
  return {
    ...INITIAL_STATE,

    toggleModel: modelId => {
      const current = get_().selectedModelIds;
      if (current.includes(modelId)) {
        set_({ selectedModelIds: current.filter(id => id !== modelId) });
      } else {
        set_({ selectedModelIds: [...current, modelId] });
      }
      persistSelections(get_);
    },

    setSelectedModelIds: ids => {
      set_({ selectedModelIds: ids });
      persistSelections(get_);
    },
    setPrompt: prompt => set_({ prompt }),
    setAspectRatio: ratio => {
      set_({ aspectRatio: ratio });
      persistSelections(get_);
    },
    setAdvancedParams: params => {
      set_({ advancedParams: { ...get_().advancedParams, ...params } });
      persistSelections(get_);
    },
    setFilterMode: mode => {
      set_({ filterMode: mode });
      persistSelections(get_);
    },
    setPanelWidth: width => {
      const clamped = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, width)
      );
      set_({ panelWidth: clamped });
      set(CACHE_KEYS.canvasPanelWidth, clamped);
    },
    setIsResizing: resizing => set_({ isResizing: resizing }),
    resetPanelWidth: () => {
      set_({ panelWidth: DEFAULT_PANEL_WIDTH });
      set(CACHE_KEYS.canvasPanelWidth, DEFAULT_PANEL_WIDTH);
    },
    resetForm: () => {
      for (const img of get_().referenceImages) {
        if (img.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(img.previewUrl);
        }
      }
      set_({
        prompt: "",
        advancedParams: {},
        referenceImages: [],
      });
    },
    togglePanel: () => {
      const next = !get_().isPanelVisible;
      set_({ isPanelVisible: next });
      set(CACHE_KEYS.canvasPanelVisible, next);
    },
    toggleImageSelection: imageId => {
      const current = get_().selectedImageIds;
      const next = new Set(current);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      set_({ selectedImageIds: next });
    },
    clearImageSelection: () => {
      set_({ selectedImageIds: new Set() });
    },
    addReferenceImage: (storageId, previewUrl) => {
      set_({
        referenceImages: [...get_().referenceImages, { storageId, previewUrl }],
      });
    },
    removeReferenceImage: index => {
      const prev = get_().referenceImages;
      const removed = prev[index];
      if (removed?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      set_({ referenceImages: prev.filter((_, i) => i !== index) });
    },
    clearReferenceImages: () => {
      for (const img of get_().referenceImages) {
        if (img.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(img.previewUrl);
        }
      }
      set_({ referenceImages: [] });
    },
    setIsGeneratingPrompt: v => set_({ isGeneratingPrompt: v }),
    setPromptModel: (modelId, provider) =>
      set_({ promptModelId: modelId, promptModelProvider: provider }),
    setPromptPersonaId: id => set_({ promptPersonaId: id }),
  };
}

export const createCanvasStore = () =>
  createStore<CanvasState>()(
    devtools((s, g) => createCanvasState(s, g), {
      name: "CanvasStore",
    })
  );

const canvasStoreApi: CanvasStoreApi = createCanvasStore();

type CanvasSelector<T> = (state: CanvasState) => T;

function useCanvasStoreBase<T>(
  selector: CanvasSelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    canvasStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useCanvasStore = Object.assign(useCanvasStoreBase, {
  getState: () => canvasStoreApi.getState(),
  setState: (...args: Parameters<CanvasStoreApi["setState"]>) =>
    canvasStoreApi.setState(...args),
  subscribe: (...args: Parameters<CanvasStoreApi["subscribe"]>) =>
    canvasStoreApi.subscribe(...args),
});
