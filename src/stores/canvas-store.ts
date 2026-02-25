import { devtools } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

export type CanvasFilterMode = "all" | "canvas" | "conversations";

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
    resetForm: () =>
      set_({
        prompt: "",
        advancedParams: {},
      }),
    togglePanel: () => {
      const next = !get_().isPanelVisible;
      set_({ isPanelVisible: next });
      set(CACHE_KEYS.canvasPanelVisible, next);
    },
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
