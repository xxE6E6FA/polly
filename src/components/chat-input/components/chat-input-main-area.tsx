import type { Id } from "@convex/_generated/dataModel";
import type { GenerationMode } from "@/types";
import { TextInputSection } from "../sections/text-input-section";

interface ChatInputMainAreaProps {
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  disabled: boolean;
  autoFocus: boolean;
  hasExistingMessages: boolean;
  mentionOpen: boolean;
  mentionQuery: string;
  mentionActiveIndex: number;
  mentionItems: Array<{
    id: Id<"personas"> | null;
    name: string;
    icon?: string;
  }>;
  onMentionStateChange: (state: {
    open: boolean;
    query: string;
    activeIndex: number;
  }) => void;
  onMentionNavigate?: (direction: "up" | "down") => boolean;
  onMentionConfirm?: () => Id<"personas"> | null;
  onMentionCancel?: () => boolean;
  personas: Array<{
    _id: Id<"personas">;
    name: string;
    icon?: string;
  }>;
  onMentionSelect?: (personaId: Id<"personas"> | null) => void;
  canSend: boolean;
  generationMode: GenerationMode;
  hasReplicateApiKey: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null;
  userMessages: string[];
}

export function ChatInputMainArea({
  onSubmit,
  textareaRef,
  placeholder,
  disabled,
  autoFocus,
  hasExistingMessages,
  mentionOpen,
  mentionQuery,
  mentionActiveIndex,
  mentionItems,
  onMentionStateChange,
  onMentionNavigate,
  onMentionConfirm,
  onMentionCancel,
  personas,
  onMentionSelect,
  canSend,
  generationMode,
  hasReplicateApiKey,
  selectedImageModel,
  userMessages,
}: ChatInputMainAreaProps) {
  return (
    <TextInputSection
      onSubmit={onSubmit}
      textareaRef={textareaRef}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      hasExistingMessages={hasExistingMessages}
      mentionOpen={mentionOpen}
      mentionQuery={mentionQuery}
      mentionActiveIndex={mentionActiveIndex}
      mentionItems={mentionItems}
      onMentionStateChange={onMentionStateChange}
      onMentionNavigate={onMentionNavigate}
      onMentionConfirm={onMentionConfirm}
      onMentionCancel={onMentionCancel}
      personas={personas}
      onMentionSelect={onMentionSelect}
      canSend={canSend}
      generationMode={generationMode}
      hasReplicateApiKey={hasReplicateApiKey}
      selectedImageModel={selectedImageModel}
      userMessages={userMessages}
    />
  );
}
