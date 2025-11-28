import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";

export type PendingUpload = {
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "error";
  error?: string;
  /** Whether this is an image upload */
  isImage?: boolean;
  /** Base64 thumbnail for image preview during upload */
  thumbnail?: string;
};

export type UploadProgressState = {
  /** Map of fileKey -> upload progress */
  pendingUploads: Map<string, PendingUpload>;
  /** Start tracking a file upload */
  startUpload: (
    fileKey: string,
    fileName: string,
    options?: { isImage?: boolean; thumbnail?: string }
  ) => void;
  /** Update upload progress */
  updateProgress: (fileKey: string, progress: number) => void;
  /** Mark upload as processing (after upload, before complete) */
  markProcessing: (fileKey: string) => void;
  /** Mark upload as complete and remove from pending */
  completeUpload: (fileKey: string) => void;
  /** Mark upload as failed */
  failUpload: (fileKey: string, error: string) => void;
  /** Clear all pending uploads */
  clearAll: () => void;
};

function createUploadProgressState(
  set: StoreApi<UploadProgressState>["setState"],
  get: StoreApi<UploadProgressState>["getState"]
): UploadProgressState {
  return {
    pendingUploads: new Map(),

    startUpload: (fileKey, fileName, options) => {
      set(state => {
        const next = new Map(state.pendingUploads);
        next.set(fileKey, {
          fileName,
          progress: 0,
          status: "uploading",
          isImage: options?.isImage,
          thumbnail: options?.thumbnail,
        });
        return { pendingUploads: next };
      });
    },

    updateProgress: (fileKey, progress) => {
      const current = get().pendingUploads.get(fileKey);
      if (!current) {
        return;
      }
      set(state => {
        const next = new Map(state.pendingUploads);
        next.set(fileKey, { ...current, progress });
        return { pendingUploads: next };
      });
    },

    markProcessing: fileKey => {
      const current = get().pendingUploads.get(fileKey);
      if (!current) {
        return;
      }
      set(state => {
        const next = new Map(state.pendingUploads);
        next.set(fileKey, { ...current, status: "processing", progress: 90 });
        return { pendingUploads: next };
      });
    },

    completeUpload: fileKey => {
      set(state => {
        const next = new Map(state.pendingUploads);
        next.delete(fileKey);
        return { pendingUploads: next };
      });
    },

    failUpload: (fileKey, error) => {
      const current = get().pendingUploads.get(fileKey);
      if (!current) {
        return;
      }
      set(state => {
        const next = new Map(state.pendingUploads);
        next.set(fileKey, { ...current, status: "error", error });
        return { pendingUploads: next };
      });
    },

    clearAll: () => {
      set({ pendingUploads: new Map() });
    },
  };
}

export type UploadProgressStoreApi = StoreApi<UploadProgressState>;

const uploadProgressStoreApi: UploadProgressStoreApi =
  createStore<UploadProgressState>()(createUploadProgressState);

export function useUploadProgressStore<T>(
  selector: (state: UploadProgressState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    uploadProgressStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

/** Get the store API for direct access outside React */
export const getUploadProgressStore = () => uploadProgressStoreApi;
