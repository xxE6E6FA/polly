import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserIcon, XIcon } from "@phosphor-icons/react";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import { useAction, useConvex, useQuery } from "convex/react";
import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { ModelPicker } from "@/components/model-picker";
import { ReasoningPicker } from "@/components/reasoning-picker";
import { TemperaturePicker } from "@/components/temperature-picker";
import { useChatInputPreservation } from "@/hooks/use-chat-input-preservation";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import {
  convertImageToWebP,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { getDefaultReasoningConfig } from "@/lib/message-reasoning-utils";
import { ROUTES } from "@/lib/routes";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";
import { AspectRatioPicker } from "./aspect-ratio-picker";
import { AttachmentDisplay } from "./attachment-display";
import { ChatInputField } from "./chat-input-field";
import { ExpandToggleButton } from "./expand-toggle-button";
import { FileUploadButton } from "./file-upload-button";
import { GenerationModeToggle } from "./generation-mode-toggle";
import { ImageGenerationSettings } from "./image-generation-settings";
import { ImageModelPicker } from "./image-model-picker";
import { NegativePromptToggle } from "./negative-prompt-toggle";
import { PersonaMentionTypeahead } from "./persona-mention-typeahead";
import { PersonaSelector } from "./persona-selector";
import { SendButtonGroup } from "./send-button-group";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => void;
  onSendAsNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<ConversationId | undefined>;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
  onTemperatureChange?: (temperature: number | undefined) => void;
  messages?: ChatMessage[]; // Add messages prop for history navigation
  // Optimized: provide just user message contents to avoid full re-render coupling
  userMessageContents?: string[];
  autoFocus?: boolean;
  conversationPersonaId?: Id<"personas"> | null;
}

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
  getCurrentReasoningConfig: () => ReasoningConfig;
};

const getNewQuotedValue = (currentValue: string, quote: string) => {
  return currentValue ? `${currentValue}\n\n${quote}\n\n` : `${quote}\n\n`;
};

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      onSendMessage,
      onSendAsNewConversation,
      conversationId,
      hasExistingMessages = false,
      isLoading = false,
      isStreaming = false,
      onStop,
      placeholder = "Ask me anything...",
      currentReasoningConfig,
      currentTemperature,
      onTemperatureChange,
      messages,
      userMessageContents,
      autoFocus = false,
      conversationPersonaId,
    },
    ref
  ) => {
    const { user, canSendMessage } = useUserDataContext();
    const { hasReplicateApiKey } = useReplicateApiKey();
    const navigate = useNavigate();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const personaChipRef = useRef<HTMLSpanElement>(null);
    const { isPrivateMode } = usePrivateMode();
    const { setChatInputState, getChatInputState, clearChatInputState } =
      useChatInputPreservation();
    const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
    const selectedModel = useMemo(() => {
      if (selectedModelRaw) {
        return selectedModelRaw;
      }
      return get(CACHE_KEYS.selectedModel, null);
    }, [selectedModelRaw]);

    // Query enabled image models to check capabilities
    const enabledImageModels = useQuery(
      api.imageModels.getUserImageModels,
      user?._id ? {} : "skip"
    );

    const _generateSummaryAction = useAction(
      api.conversationSummary.generateConversationSummary
    );
    // Always preserve state per conversation, use global state for new conversations
    const shouldUsePreservedState = !hasExistingMessages; // Preserve input for empty conversations
    const [input, setInputState] = useState(() =>
      shouldUsePreservedState ? getChatInputState(conversationId).input : ""
    );
    const [attachments, setAttachmentsState] = useState<Attachment[]>(() =>
      shouldUsePreservedState
        ? getChatInputState(conversationId).attachments
        : []
    );
    const [selectedPersonaId, setSelectedPersonaIdState] =
      useState<Id<"personas"> | null>(() =>
        shouldUsePreservedState
          ? getChatInputState(conversationId).selectedPersonaId
          : null
      );
    const [reasoningConfig, setReasoningConfigState] =
      useState<ReasoningConfig>(() => {
        if (shouldUsePreservedState) {
          return getChatInputState(conversationId).reasoningConfig;
        }
        return getDefaultReasoningConfig();
      });
    const [temperature, setTemperatureState] = useState<number | undefined>(
      () =>
        shouldUsePreservedState
          ? getChatInputState(conversationId).temperature
          : currentTemperature
    );

    // Image generation state
    const [generationMode, setGenerationMode] =
      useState<GenerationMode>("text");
    const [imageParams, setImageParams] = useState<ImageGenerationParams>({
      prompt: "",
      model: IMAGE_GENERATION_DEFAULTS.MODEL,
      aspectRatio: IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO,
      steps: IMAGE_GENERATION_DEFAULTS.STEPS,
      guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
      count: IMAGE_GENERATION_DEFAULTS.COUNT,
      negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
    });

    // Negative prompt toggle state (separate from imageParams for better UX)
    const [negativePromptEnabled, setNegativePromptEnabled] = useState(false);

    // Fullscreen input state
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMultiline, setIsMultiline] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // @persona mention typeahead state
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [personaChipWidth, setPersonaChipWidth] = useState<number>(0);

    // Fetch personas to render chip info
    const personasRaw = useQuery(api.personas.list, user?._id ? {} : "skip");
    const personas = useMemo(
      () => (Array.isArray(personasRaw) ? personasRaw : []),
      [personasRaw]
    );
    const mentionItems = useMemo(() => {
      const q = mentionQuery.trim().toLowerCase();
      const base: Array<{
        id: Id<"personas"> | null;
        name: string;
        icon?: string;
      }> = [{ id: null, name: "Default", icon: "🤖" }];
      const filtered = q
        ? personas.filter(p => p.name.toLowerCase().includes(q))
        : personas;
      return base.concat(
        filtered.map(p => ({ id: p._id, name: p.name, icon: p.icon }))
      );
    }, [mentionQuery, personas]);
    const currentPersona = useMemo(
      () =>
        selectedPersonaId
          ? personas.find(p => p._id === selectedPersonaId) || null
          : null,
      [personas, selectedPersonaId]
    );

    // Reset active index when menu opens
    useEffect(() => {
      if (mentionOpen) {
        setMentionActiveIndex(0);
      }
    }, [mentionOpen]);

    // Measure persona chip width to indent first line accordingly
    useEffect(() => {
      if (!selectedPersonaId) {
        setPersonaChipWidth(0);
        return;
      }
      const measure = () => {
        const w = personaChipRef.current?.getBoundingClientRect().width;
        setPersonaChipWidth(Math.ceil(w || 0));
      };
      measure();
      const onResize = () => measure();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }, [selectedPersonaId]);

    // Force text mode when in private mode or no Replicate API key
    useEffect(() => {
      if (
        (isPrivateMode || !hasReplicateApiKey) &&
        generationMode === "image"
      ) {
        setGenerationMode("text");
      }
    }, [isPrivateMode, hasReplicateApiKey, generationMode]);

    // Sync negative prompt toggle state with imageParams.negativePrompt
    useEffect(() => {
      const hasNegativePrompt =
        imageParams.negativePrompt &&
        imageParams.negativePrompt.trim().length > 0;
      setNegativePromptEnabled(!!hasNegativePrompt);
    }, [imageParams.negativePrompt]);

    // Find the selected image model to check its capabilities
    const selectedImageModel = useMemo(() => {
      if (!imageParams.model) {
        return null;
      }

      // First check enabled models for accurate capability detection
      if (enabledImageModels) {
        const foundModel = enabledImageModels.find(
          model => model.modelId === imageParams.model
        );

        if (foundModel) {
          return foundModel;
        }
      }

      // For models not in user's enabled list, return basic info without capability detection
      // This ensures we don't show capability options unless we're certain they're supported
      return {
        modelId: imageParams.model,
        supportsMultipleImages: false, // Conservative default - only show if we know it's supported
        supportsNegativePrompt: false, // Conservative default - only show if we know it's supported
      };
    }, [enabledImageModels, imageParams.model]);

    // Access conversation messages for history navigation
    const shouldFetchMessages =
      messages === undefined && userMessageContents === undefined;
    const { messages: conversationMessages } = useChatMessages({
      conversationId: shouldFetchMessages ? conversationId : undefined,
      onError: () => {
        // Handle errors gracefully - history navigation is optional
      },
    });

    // History navigation state
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [originalInput, setOriginalInput] = useState("");

    // Initialize file upload hook
    const { uploadFile } = useConvexFileUpload();
    const notificationDialog = useNotificationDialog();
    const convex = useConvex();

    // Drag and drop state
    const [isDragOver, setIsDragOver] = useState(false);

    // Custom function to upload attachments to Convex storage
    const uploadAttachmentsToConvex = useCallback(
      async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
        if (isPrivateMode) {
          // In private mode, convert base64 content to data URLs for local use
          return attachmentsToUpload.map(attachment => {
            if (attachment.content && attachment.mimeType && !attachment.url) {
              return {
                ...attachment,
                url: `data:${attachment.mimeType};base64,${attachment.content}`,
                contentType: attachment.mimeType, // AI SDK expects contentType field
              };
            }
            return attachment;
          });
        }

        const uploadedAttachments: Attachment[] = [];

        for (const attachment of attachmentsToUpload) {
          if (attachment.type === "text" || attachment.storageId) {
            uploadedAttachments.push(attachment);
          } else if (attachment.content && attachment.mimeType) {
            try {
              // Convert Base64 back to File object for upload
              const byteCharacters = atob(attachment.content);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const file = new File([byteArray], attachment.name, {
                type: attachment.mimeType,
              });

              const uploadResult = await uploadFile(file);

              // Preserve extracted text for PDFs
              if (attachment.type === "pdf" && attachment.extractedText) {
                uploadResult.extractedText = attachment.extractedText;
              }

              uploadedAttachments.push(uploadResult);
            } catch (error) {
              console.error("Failed to upload attachment:", error);
              // For large files, don't fall back to base64 content as it exceeds Convex limits
              if (attachment.size > 1024 * 1024) {
                // 1MB limit
                throw new Error(
                  `Failed to upload large file "${attachment.name}". File uploads to storage are required for files over 1MB.`
                );
              }
              // For smaller files, keep the original attachment as fallback
              uploadedAttachments.push(attachment);
            }
          } else {
            uploadedAttachments.push(attachment);
          }
        }

        return uploadedAttachments;
      },
      [isPrivateMode, uploadFile]
    );

    // Sync state updates to preserved state
    useEffect(() => {
      if (!shouldUsePreservedState) {
        return;
      }

      setChatInputState(
        {
          selectedPersonaId,
          input,
          reasoningConfig,
          attachments,
          temperature,
        },
        conversationId
      );
    }, [
      shouldUsePreservedState,
      setChatInputState,
      selectedPersonaId,
      input,
      reasoningConfig,
      attachments,
      temperature,
      conversationId,
    ]);

    useEffect(() => {
      if (conversationId && !shouldUsePreservedState) {
        setReasoningConfigState(getDefaultReasoningConfig());
      } else if (currentReasoningConfig && shouldUsePreservedState) {
        setReasoningConfigState(currentReasoningConfig);
      }
    }, [conversationId, shouldUsePreservedState, currentReasoningConfig]);

    // State setters with preservation
    const setInput = useCallback(
      (value: string) => {
        setInputState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ input: value }, conversationId);
        }
      },
      [shouldUsePreservedState, setChatInputState, conversationId]
    );

    const setAttachments = useCallback(
      (newValue: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
        const value =
          typeof newValue === "function" ? newValue(attachments) : newValue;
        setAttachmentsState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ attachments: value }, conversationId);
        }
      },
      [shouldUsePreservedState, setChatInputState, conversationId, attachments]
    );

    // Get user messages for history navigation
    const userMessages = useMemo(() => {
      if (userMessageContents) {
        return userMessageContents;
      }
      const sourceMessages = messages || conversationMessages;
      if (!sourceMessages) {
        return [];
      }
      return sourceMessages
        .filter(msg => msg.role === "user")
        .map(msg => msg.content)
        .reverse();
    }, [userMessageContents, messages, conversationMessages]);

    // Handle history navigation (Up = older messages)
    const handleHistoryNavigation = useCallback(() => {
      if (userMessages.length === 0) {
        return false;
      }

      // Store original input on first navigation
      if (historyIndex === -1) {
        setOriginalInput(input);
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex < userMessages.length) {
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);

        // Move cursor to end after setting text
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      return false;
    }, [historyIndex, input, userMessages, setInput]);

    // Handle reverse history navigation (Down = newer messages)
    const handleHistoryNavigationDown = useCallback(() => {
      // Only allow down navigation if we're already in history mode
      if (historyIndex <= -1) {
        return false;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex === -1) {
        // Return to original input
        setHistoryIndex(-1);
        setInput(originalInput);

        // Move cursor to end after setting text
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      if (nextIndex >= 0) {
        // Navigate to newer message in history
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);

        // Move cursor to end after setting text
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      return false;
    }, [historyIndex, originalInput, userMessages, setInput]);

    // Reset history when input changes (user typing)
    const handleInputChange = useCallback(
      (value: string) => {
        if (historyIndex !== -1 && value !== userMessages[historyIndex]) {
          setHistoryIndex(-1);
          setOriginalInput("");
        }
        setInput(value);

        // Disable @ mentions in all existing conversations
        const mentionsDisabled = hasExistingMessages;
        if (mentionsDisabled) {
          if (mentionOpen) {
            setMentionOpen(false);
            setMentionQuery("");
          }
          return;
        }

        // If persona already selected, do not allow new mentions
        if (selectedPersonaId) {
          if (mentionOpen) {
            setMentionOpen(false);
            setMentionQuery("");
          }
          return;
        }

        // Detect @ mention start: open minimal persona picker
        const selStart = textareaRef.current?.selectionStart ?? value.length;
        const upto = value.slice(0, selStart);
        const atIndex = Math.max(upto.lastIndexOf(" @"), upto.lastIndexOf("@"));
        const spaceAfter = upto.lastIndexOf(" ");
        const isAtStart = atIndex === 0 || upto[atIndex - 1] === " ";
        const hasCloserSpace = spaceAfter > atIndex;

        if (atIndex !== -1 && isAtStart && !hasCloserSpace) {
          const afterAt = upto.slice(atIndex + 1);
          // stop on whitespace/newline
          const q = afterAt.split(/\s|\n/)[0];
          setMentionQuery(q);
          setMentionOpen(true);
        } else if (mentionOpen) {
          setMentionOpen(false);
          setMentionQuery("");
        }
      },
      [
        historyIndex,
        userMessages,
        setInput,
        mentionOpen,
        selectedPersonaId,
        hasExistingMessages,
      ]
    );

    // Fullscreen input handlers
    const handleHeightChange = useCallback((multiline: boolean) => {
      setIsMultiline(multiline);
    }, []);

    const handleToggleFullscreen = useCallback(() => {
      setIsTransitioning(true);
      setIsFullscreen(!isFullscreen);

      // Reset transition state after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }, [isFullscreen]);

    const handleCloseFullscreen = useCallback(() => {
      setIsTransitioning(true);
      setIsFullscreen(false);

      // Reset transition state after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }, []);

    // Handle escape key when in fullscreen mode
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isFullscreen) {
          e.preventDefault();
          handleCloseFullscreen();
        }
      };

      if (isFullscreen) {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
      }
    }, [isFullscreen, handleCloseFullscreen]);

    const setSelectedPersonaId = useCallback(
      (value: Id<"personas"> | null) => {
        setSelectedPersonaIdState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ selectedPersonaId: value }, conversationId);
        }
      },
      [shouldUsePreservedState, setChatInputState, conversationId]
    );

    const setReasoningConfig = useCallback(
      (value: ReasoningConfig) => {
        setReasoningConfigState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ reasoningConfig: value }, conversationId);
        }
      },
      [shouldUsePreservedState, setChatInputState, conversationId]
    );

    const setTemperature = useCallback(
      (value: number | undefined) => {
        setTemperatureState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ temperature: value }, conversationId);
        }
        onTemperatureChange?.(value);
      },
      [
        shouldUsePreservedState,
        setChatInputState,
        conversationId,
        onTemperatureChange,
      ]
    );

    // Negative prompt handlers
    const handleNegativePromptEnabledChange = useCallback(
      (enabled: boolean) => {
        setNegativePromptEnabled(enabled);
        if (!enabled) {
          setImageParams(prev => ({ ...prev, negativePrompt: "" }));
        }
      },
      []
    );

    const handleNegativePromptValueChange = useCallback((value: string) => {
      setImageParams(prev => ({ ...prev, negativePrompt: value }));
    }, []);

    const addAttachments = useCallback(
      (newAttachments: Attachment[]) => {
        setAttachments(prev => [...prev, ...newAttachments]);
      },
      [setAttachments]
    );

    // Process files for drag and drop
    const processFiles = useCallback(
      async (files: FileList) => {
        const newAttachments: Attachment[] = [];

        // Check if model is properly selected and typed
        const validModel =
          isUserModel(selectedModel) &&
          selectedModel.provider &&
          selectedModel.modelId
            ? selectedModel
            : null;

        for (const file of Array.from(files)) {
          // Check file size with different limits for PDFs
          const maxSize =
            file.type === "application/pdf"
              ? FILE_LIMITS.PDF_MAX_SIZE_BYTES
              : FILE_LIMITS.MAX_SIZE_BYTES;

          if (file.size > maxSize) {
            notificationDialog.notify({
              title: "File Too Large",
              description: `File ${file.name} exceeds the ${Math.round(
                maxSize / (1024 * 1024)
              )}MB limit.`,
              type: "error",
            });
            continue;
          }

          // Check if we have a valid model for file type checking
          if (!validModel) {
            notificationDialog.notify({
              title: "No Model Selected",
              description: "Please select a model to upload files.",
              type: "error",
            });
            continue;
          }

          const fileSupport = isFileTypeSupported(file.type, validModel);
          if (!fileSupport.supported) {
            notificationDialog.notify({
              title: "Unsupported File Type",
              description: `File ${file.name} is not supported by the current model.`,
              type: "error",
            });
            continue;
          }

          try {
            if (fileSupport.category === "text") {
              const textContent = await readFileAsText(file);
              newAttachments.push({
                type: "text",
                url: "",
                name: file.name,
                size: file.size,
                content: textContent,
              });
            } else if (fileSupport.category === "pdf") {
              // Always upload PDFs as PDF attachments
              // Text extraction will happen on submit if needed
              const base64Content = await readFileAsBase64(file);
              newAttachments.push({
                type: "pdf",
                url: "",
                name: file.name,
                size: file.size,
                content: base64Content,
                mimeType: file.type,
              });
            } else {
              let base64Content: string;
              let mimeType = file.type;

              if (fileSupport.category === "image") {
                try {
                  const converted = await convertImageToWebP(file);
                  base64Content = converted.base64;
                  mimeType = converted.mimeType;
                } catch {
                  base64Content = await readFileAsBase64(file);
                }
              } else {
                base64Content = await readFileAsBase64(file);
              }

              newAttachments.push({
                type: fileSupport.category as "image" | "pdf" | "text",
                url: "",
                name: file.name,
                size: file.size,
                content: base64Content,
                mimeType,
              });
            }
          } catch {
            notificationDialog.notify({
              title: "File Upload Failed",
              description: `Failed to process ${file.name}`,
              type: "error",
            });
          }
        }

        if (newAttachments.length > 0) {
          addAttachments(newAttachments);
        }
      },
      [selectedModel, notificationDialog, addAttachments]
    );

    const removeAttachment = useCallback(
      (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
      },
      [setAttachments]
    );

    const canSend = canSendMessage;
    const [isUploading, setIsUploading] = useState(false);
    const isProcessing = isUploading;

    // Drag and drop event handlers
    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) {
          setIsDragOver(true);
        }
      },
      [isDragOver]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Only set drag over to false if we're leaving the container
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const isOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;

      if (isOutside) {
        setIsDragOver(false);
      }
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!canSend || isLoading || isStreaming) {
          return;
        }

        const files = e.dataTransfer.files;
        if (files.length > 0) {
          await processFiles(files);
        }
      },
      [canSend, isLoading, isStreaming, processFiles]
    );

    const deferredInputHasText = useDeferredValue(
      input.trim().length > 0 || attachments.length > 0
    );

    const submit = useCallback(async () => {
      if (mentionOpen) {
        return;
      }
      if (input.trim().length === 0 && attachments.length === 0) {
        return;
      }

      setIsUploading(true);

      try {
        if (generationMode === "image") {
          // Handle image generation
          if (!imageParams.model?.trim()) {
            throw new Error(
              "Please enter a Replicate model ID in the settings. You can copy model IDs from replicate.com."
            );
          }

          if (conversationId) {
            // Existing conversation, proceed normally
            // Create only a user message for the prompt (no AI response)
            const result = await convex.action(
              api.conversations.createUserMessage,
              {
                conversationId,
                content: input.trim(),
                personaId: selectedPersonaId || undefined,
              }
            );

            // Trigger image generation with the user message ID
            await handleImageGeneration(
              convex,
              conversationId,
              result.userMessageId,
              input.trim(),
              imageParams
            );
          } else {
            // No conversation exists, create a new one for image generation
            const newConversation = await convex.action(
              api.conversations.createConversationAction,
              {
                title: "Image Generation", // Title for the new conversation
              }
            );

            // Create only a user message for the prompt (no AI response)
            const result = await convex.action(
              api.conversations.createUserMessage,
              {
                conversationId: newConversation.conversationId,
                content: input.trim(),
                personaId: selectedPersonaId || undefined,
              }
            );

            // Trigger image generation with the user message ID
            await handleImageGeneration(
              convex,
              newConversation.conversationId,
              result.userMessageId,
              input.trim(),
              imageParams
            );

            // Navigate to the new conversation
            navigate(ROUTES.CHAT_CONVERSATION(newConversation.conversationId));
          }
        } else {
          // Handle text generation (existing logic)
          // Skip PDF extraction - it will be done server-side with proper loading states
          const processedAttachments = attachments;

          // Upload attachments to Convex storage if not in private mode
          const uploadedAttachments =
            await uploadAttachmentsToConvex(processedAttachments);

          onSendMessage(
            input.trim(),
            uploadedAttachments,
            selectedPersonaId,
            reasoningConfig.enabled ? reasoningConfig : undefined,
            temperature
          );
        }

        setInput("");
        setAttachments([]);
        // Clear negative prompt
        setImageParams(prev => ({ ...prev, negativePrompt: "" }));
        setNegativePromptEnabled(false);
        textareaRef.current?.focus();
        if (shouldUsePreservedState) {
          clearChatInputState();
        }
      } catch (error) {
        notificationDialog.notify({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to send message",
          type: "error",
        });
      } finally {
        setIsUploading(false);
      }
    }, [
      input,
      attachments,
      generationMode,
      imageParams,
      selectedPersonaId,
      reasoningConfig,
      onSendMessage,
      setInput,
      setAttachments,
      shouldUsePreservedState,
      clearChatInputState,
      uploadAttachmentsToConvex,
      temperature,
      notificationDialog,
      convex,
      conversationId,
      navigate,
      mentionOpen,
    ]);

    const handleSendAsNewConversation = useCallback(
      async (
        shouldNavigate = true,
        personaId?: Id<"personas"> | null,
        reasoningConfig?: ReasoningConfig
      ) => {
        if (onSendAsNewConversation) {
          const currentInput = textareaRef.current?.value || "";

          try {
            // Generate summary if we have a current conversation
            let contextSummary: string | undefined;
            if (conversationId) {
              try {
                contextSummary = await _generateSummaryAction({
                  conversationId,
                  maxTokens: 150,
                });
              } catch (_error) {
                // Summary generation failed, continue without summary
              }
            }

            // Skip PDF extraction - it will be done server-side with proper loading states
            const processedPdfAttachments = attachments;

            // Upload attachments to Convex storage if not in private mode
            const processedAttachments = await uploadAttachmentsToConvex(
              processedPdfAttachments
            );

            const newConversationId = await onSendAsNewConversation(
              currentInput,
              shouldNavigate,
              processedAttachments,
              contextSummary,
              conversationId,
              personaId,
              reasoningConfig,
              temperature
            );

            if (newConversationId) {
              setInput("");
              setAttachments([]);
              // Clear negative prompt
              setImageParams(prev => ({ ...prev, negativePrompt: "" }));
              setNegativePromptEnabled(false);
              if (shouldUsePreservedState) {
                clearChatInputState();
              }
            }
          } catch (_error) {
            // Conversation creation error is handled by the main flow
          }
        }
      },
      [
        onSendAsNewConversation,
        attachments,
        uploadAttachmentsToConvex,
        conversationId,
        _generateSummaryAction,
        setInput,
        setAttachments,
        shouldUsePreservedState,
        clearChatInputState,
        temperature,
      ]
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        addQuote: (quote: string) => {
          const currentValue = textareaRef.current?.value.trim() || "";
          const newValue = getNewQuotedValue(currentValue, quote);
          setInput(newValue);
          setTimeout(() => textareaRef.current?.focus(), 0);
        },
        setInput,
        getCurrentReasoningConfig: () => reasoningConfig,
      }),
      [setInput, reasoningConfig]
    );

    // Determine dynamic placeholder based on generation mode
    const dynamicPlaceholder = useMemo(() => {
      if (generationMode === "image") {
        return "Describe the image you want to generate...";
      }
      return placeholder;
    }, [generationMode, placeholder]);

    if (user === undefined) {
      return null;
    }

    let chatInputStateClass: string;
    if (!canSend) {
      chatInputStateClass = "chat-input-disabled";
    } else if (isPrivateMode) {
      chatInputStateClass = "chat-input-private";
    } else {
      chatInputStateClass = "chat-input-enabled";
    }

    return (
      <div className="relative px-3 pb-2 sm:px-6 sm:pb-3">
        <div className="mx-auto w-full max-w-3xl">
          {/* Warning banners moved to UnifiedChatView to decouple input from usage updates */}

          <div
            className={cn(
              "relative chat-input-container rounded-xl p-2 sm:p-2.5 transition-all duration-700",
              chatInputStateClass,
              isDragOver && canSend && "ring-2 ring-primary/50 bg-primary/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragOver && canSend && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-sm font-medium">Drop files to upload</p>
                </div>
              </div>
            )}

            <AttachmentDisplay
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
            />

            {/* Unified input container for main prompt and negative prompt */}
            <div className="flex flex-col">
              <div className="flex items-end gap-3">
                <div className="flex-1 flex items-center relative">
                  {selectedPersonaId && (
                    <div className="absolute left-1 top-1 z-10 flex items-center gap-1 text-xs text-muted-foreground">
                      <span
                        ref={personaChipRef}
                        className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-1.5 py-0.5"
                      >
                        {currentPersona?.icon ? (
                          <span className="text-xs">{currentPersona.icon}</span>
                        ) : (
                          <UserIcon className="h-3.5 w-3.5" />
                        )}
                        <span className="max-w-[140px] truncate">
                          {currentPersona?.name || "Persona"}
                        </span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedPersonaId(null)}
                          aria-label="Clear persona"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  )}
                  <ChatInputField
                    value={input}
                    onChange={handleInputChange}
                    onSubmit={submit}
                    textareaRef={textareaRef}
                    placeholder={selectedPersonaId ? "" : dynamicPlaceholder}
                    firstLineIndentPx={
                      selectedPersonaId
                        ? Math.max(personaChipWidth + 8, 0)
                        : undefined
                    }
                    onMentionNavigate={direction => {
                      if (!mentionOpen) {
                        return false;
                      }
                      setMentionActiveIndex(prev => {
                        const next = direction === "up" ? prev - 1 : prev + 1;
                        const max = Math.max(mentionItems.length - 1, 0);
                        if (next < 0) {
                          return max;
                        }
                        if (next > max) {
                          return 0;
                        }
                        return next;
                      });
                      return true;
                    }}
                    onMentionConfirm={() => {
                      if (!mentionOpen) {
                        return false;
                      }
                      const item = mentionItems[mentionActiveIndex];
                      if (!item) {
                        return true;
                      }
                      const textarea = textareaRef.current;
                      const text = textarea ? textarea.value : input;
                      const caret = textarea?.selectionStart ?? text.length;
                      const upto = text.slice(0, caret);
                      const atIndex = Math.max(
                        upto.lastIndexOf(" @"),
                        upto.lastIndexOf("@")
                      );
                      const before = text.slice(0, atIndex);
                      const after = text.slice(caret);
                      const newText = `${before}${after}`.trimStart();
                      setInput(newText);
                      setSelectedPersonaId(item.id);
                      setMentionOpen(false);
                      setMentionQuery("");
                      setTimeout(() => textareaRef.current?.focus(), 0);
                      return true;
                    }}
                    onMentionCancel={() => {
                      // Case 1: close the mention picker if open
                      if (mentionOpen) {
                        setMentionOpen(false);
                        setMentionQuery("");
                        return true;
                      }
                      // Case 2: when input is empty and a persona chip is set, clear the chip
                      const isEmpty =
                        (textareaRef.current?.value || "").trim().length === 0;
                      if (isEmpty && selectedPersonaId) {
                        setSelectedPersonaId(null);
                        setPersonaChipWidth(0);
                        return true;
                      }
                      return false;
                    }}
                    disabled={
                      isLoading || isStreaming || isProcessing || !canSend
                    }
                    onHistoryNavigation={handleHistoryNavigation}
                    onHistoryNavigationDown={handleHistoryNavigationDown}
                    onHeightChange={handleHeightChange}
                    isTransitioning={isTransitioning}
                    autoFocus={autoFocus}
                    className={
                      isFullscreen
                        ? selectedPersonaId
                          ? "min-h-[50vh] max-h-[85vh] pl-28"
                          : "min-h-[50vh] max-h-[85vh]"
                        : selectedPersonaId
                          ? "pl-28"
                          : undefined
                    }
                  />
                  {mentionOpen && (
                    <div className="absolute -top-7 left-0 flex items-center gap-1 text-xs text-muted-foreground">
                      {selectedPersonaId && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-1.5 py-0.5">
                          {currentPersona?.icon ? (
                            <span className="text-xs">
                              {currentPersona.icon}
                            </span>
                          ) : (
                            <UserIcon className="h-3.5 w-3.5" />
                          )}
                          <span className="max-w-[140px] truncate">
                            {currentPersona?.name || "Persona"}
                          </span>
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedPersonaId(null)}
                            aria-label="Clear persona"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  <PersonaMentionTypeahead
                    open={mentionOpen}
                    items={mentionItems}
                    activeIndex={mentionActiveIndex}
                    onHoverIndex={setMentionActiveIndex}
                    onSelect={pid => {
                      const textarea = textareaRef.current;
                      const text = textarea ? textarea.value : input;
                      const caret = textarea?.selectionStart ?? text.length;
                      const upto = text.slice(0, caret);
                      const atIndex = Math.max(
                        upto.lastIndexOf(" @"),
                        upto.lastIndexOf("@")
                      );
                      const before = text.slice(0, atIndex);
                      const after = text.slice(caret);
                      const newText = `${before}${after}`.trimStart();
                      setInput(newText);
                      setSelectedPersonaId(pid);
                      setMentionOpen(false);
                      setMentionQuery("");
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                    onClose={() => setMentionOpen(false)}
                    className="left-0"
                    placement={(function () {
                      const rect = textareaRef.current?.getBoundingClientRect();
                      if (!rect) {
                        return "bottom" as const;
                      }
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const dropdownHeight = 260; // approx max height inc. paddings
                      return spaceBelow < dropdownHeight
                        ? ("top" as const)
                        : ("bottom" as const);
                    })()}
                  />
                  <ExpandToggleButton
                    onToggle={handleToggleFullscreen}
                    isVisible={(isMultiline || isFullscreen) && canSend}
                    isExpanded={isFullscreen}
                    disabled={isLoading || isStreaming || isProcessing}
                  />
                </div>
              </div>

              {/* Negative Prompt Area - Integrated below main prompt */}
              {canSend &&
                generationMode === "image" &&
                hasReplicateApiKey &&
                selectedImageModel?.supportsNegativePrompt && (
                  <div className="relative mt-1">
                    {/* Subtle visual separator */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />

                    <div className="pt-1">
                      <NegativePromptToggle
                        enabled={negativePromptEnabled}
                        value={imageParams.negativePrompt || ""}
                        onEnabledChange={handleNegativePromptEnabledChange}
                        onValueChange={handleNegativePromptValueChange}
                        disabled={isLoading || isStreaming || isProcessing}
                        onSubmit={submit}
                      />
                    </div>
                  </div>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/20 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
                {canSend && (
                  <GenerationModeToggle
                    mode={generationMode}
                    onModeChange={setGenerationMode}
                    disabled={isLoading || isStreaming}
                    hasReplicateApiKey={hasReplicateApiKey}
                  />
                )}

                {/* Image generation controls */}
                {canSend &&
                  generationMode === "image" &&
                  !isPrivateMode &&
                  hasReplicateApiKey && (
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <ImageModelPicker
                        model={imageParams.model}
                        onModelChange={model =>
                          setImageParams(prev => ({ ...prev, model }))
                        }
                        enabledImageModels={enabledImageModels || []}
                      />
                      <AspectRatioPicker
                        aspectRatio={imageParams.aspectRatio}
                        onAspectRatioChange={aspectRatio =>
                          setImageParams(prev => ({
                            ...prev,
                            aspectRatio: aspectRatio as
                              | "1:1"
                              | "16:9"
                              | "9:16"
                              | "4:3"
                              | "3:4",
                          }))
                        }
                      />
                      <ImageGenerationSettings
                        params={imageParams}
                        onParamsChange={updates =>
                          setImageParams(prev => ({ ...prev, ...updates }))
                        }
                        selectedModel={
                          selectedImageModel
                            ? {
                                modelId: selectedImageModel.modelId,
                                supportsMultipleImages:
                                  selectedImageModel.supportsMultipleImages ??
                                  false,
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}

                {/* Text generation controls */}
                {canSend && generationMode === "text" && (
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <PersonaSelector
                      conversationId={conversationId}
                      hasExistingMessages={hasExistingMessages}
                      selectedPersonaId={selectedPersonaId}
                      onPersonaSelect={setSelectedPersonaId}
                    />
                    <ModelPicker />
                    <TemperaturePicker
                      temperature={temperature}
                      onTemperatureChange={setTemperature}
                      disabled={isLoading || isStreaming}
                    />
                    {selectedModel && isUserModel(selectedModel) ? (
                      <ReasoningPicker
                        model={selectedModel}
                        config={reasoningConfig}
                        onConfigChange={setReasoningConfig}
                      />
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {canSend && (
                  <FileUploadButton
                    disabled={isLoading || isStreaming || isUploading}
                    onAddAttachments={addAttachments}
                    isSubmitting={isProcessing}
                    selectedModel={selectedModel}
                  />
                )}
                <SendButtonGroup
                  canSend={canSend}
                  isStreaming={Boolean(isStreaming)}
                  isLoading={Boolean(isLoading || isProcessing)}
                  isSummarizing={false}
                  hasExistingMessages={Boolean(hasExistingMessages)}
                  conversationId={conversationId}
                  hasInputText={deferredInputHasText}
                  onSend={submit}
                  onStop={onStop}
                  onSendAsNewConversation={
                    onSendAsNewConversation
                      ? handleSendAsNewConversation
                      : undefined
                  }
                  hasApiKeys={canSend}
                  hasEnabledModels={canSend}
                  personaId={selectedPersonaId}
                  reasoningConfig={reasoningConfig}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = "ChatInput";
