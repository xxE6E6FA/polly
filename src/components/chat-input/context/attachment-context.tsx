import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { AIModel, Attachment } from "@/types";
import { useChatInputFileHandling } from "../hooks";

interface AttachmentContextValue {
  attachments: Attachment[];
  selectedModel: AIModel | null;
  addAttachments: (newAttachments: Attachment[]) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  uploadAttachmentsToConvex: (
    attachments: Attachment[]
  ) => Promise<Attachment[]>;
  processFiles: (files: FileList) => Promise<void>;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

interface AttachmentProviderProps {
  children: ReactNode;
  selectedModel: AIModel | null;
}

export function AttachmentProvider({
  children,
  selectedModel,
}: AttachmentProviderProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { isPrivateMode } = usePrivateMode();

  const { uploadAttachmentsToConvex, processFiles } = useChatInputFileHandling({
    selectedModel,
    isPrivateMode,
    onAddAttachments: setAttachments,
  });

  const addAttachments = useCallback((newAttachments: Attachment[]) => {
    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const contextValue: AttachmentContextValue = {
    attachments,
    selectedModel,
    addAttachments,
    removeAttachment,
    clearAttachments,
    uploadAttachmentsToConvex,
    processFiles,
  };

  return (
    <AttachmentContext.Provider value={contextValue}>
      {children}
    </AttachmentContext.Provider>
  );
}

export function useAttachments() {
  const context = useContext(AttachmentContext);
  if (!context) {
    throw new Error("useAttachments must be used within AttachmentProvider");
  }
  return context;
}
