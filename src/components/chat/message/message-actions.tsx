import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  ChartBarIcon,
  DotsThreeIcon,
  HeartIcon,
  NotePencilIcon,
  SpeakerHighIcon,
  SquareIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type React from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelTitle } from "@/hooks/use-model-catalog";
import { useUserSettings } from "@/hooks/use-user-settings";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import type { WebSearchCitation } from "@/types";
import { CitationAvatarStack } from "../citation-avatar-stack";
import {
  ActionButton,
  ActionButtons,
  actionButtonStyles,
  DRAWER_ICON_SIZE,
  DrawerItem,
} from "./action-button";
import { BranchActionButton, BranchActionDrawerItem } from "./branch-action";
import {
  type ImageRetryParams,
  ImageRetryPopover,
} from "./image-retry-popover";
import { RetryDropdown } from "./retry-model-menu";

type TtsState = "idle" | "loading" | "playing";

function getTTSTooltip(ttsState: TtsState): string {
  if (ttsState === "loading") {
    return "Cancel generation";
  }
  if (ttsState === "playing") {
    return "Stop audio";
  }
  return "Listen";
}

function getTTSIconForDrawer(ttsState: TtsState): React.ReactNode {
  if (ttsState === "loading") {
    return <Spinner size="sm" className={DRAWER_ICON_SIZE} />;
  }
  if (ttsState === "playing") {
    return (
      <SquareIcon
        className={cn(DRAWER_ICON_SIZE, "text-destructive")}
        weight="fill"
      />
    );
  }
  return <SpeakerHighIcon className={DRAWER_ICON_SIZE} />;
}

function getTTSIconForButton(ttsState: TtsState): React.ReactNode {
  if (ttsState === "loading") {
    return <Spinner size="sm" className="h-3.5 w-3.5" />;
  }
  if (ttsState === "playing") {
    return <SquareIcon className="size-3.5 text-destructive" weight="fill" />;
  }
  return <SpeakerHighIcon className="size-3.5" />;
}

type MessageActionsProps = {
  isUser: boolean;
  isStreaming: boolean;
  isEditing?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  messageId?: string;
  conversationId?: string;
  copyToClipboard: () => void;
  onEditMessage?: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: () => void;
  onOpenZenMode?: () => void;
  model?: string;
  provider?: string;
  className?: string;
  // When true, keeps actions visible regardless of group hover.
  forceVisible?: boolean;
  // Citations for avatar stack
  citations?: WebSearchCitation[];
  citationsExpanded?: boolean;
  onToggleCitations?: () => void;
  // Image generation retry support
  isImageGenerationMessage?: boolean;
  imageGenerationParams?: {
    model?: string;
    aspectRatio?: string;
  };
  onRetryImageGeneration?: (params: ImageRetryParams) => void;
};

export const MessageActions = memo(
  ({
    isUser,
    isStreaming,
    isEditing = false,
    isCopied,
    isRetrying,
    isDeleting,
    messageId,
    conversationId,
    copyToClipboard,
    onEditMessage,
    onRetryMessage,
    onRefineMessage,
    onDeleteMessage,
    onOpenZenMode,
    model,
    provider,
    className,
    forceVisible,
    citations,
    citationsExpanded = false,
    onToggleCitations,
    metadata,
    isImageGenerationMessage,
    imageGenerationParams,
    onRetryImageGeneration,
  }: MessageActionsProps & {
    metadata?: Doc<"messages">["metadata"];
  }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isOverflowDrawerOpen, setIsOverflowDrawerOpen] = useState(false);
    const { isPrivateMode } = usePrivateMode();
    const managedToast = useToast();
    const navigate = useNavigate();
    const modelTitle = useModelTitle(model, provider);
    const userSettings = useUserSettings();

    const showMetadata =
      userSettings?.showMessageMetadata && metadata?.tokenUsage;
    const tokenUsage = metadata?.tokenUsage;

    const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing">(
      "idle"
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const createTTSStreamUrl = useAction(api.ai.elevenlabs.createTTSStreamUrl);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isCancelledRef = useRef(false);
    const toggleFavorite = useMutation(api.messages.toggleFavorite);
    const isFavoritedFromServer = useQuery(
      api.messages.isFavorited,
      !isPrivateMode &&
        messageId &&
        !messageId.startsWith("private-") &&
        !messageId.startsWith("user-") &&
        !messageId.startsWith("assistant-") &&
        !messageId.startsWith("temp-") &&
        !messageId.startsWith("optimistic-")
        ? ({ messageId: messageId as Id<"messages"> } as const)
        : ("skip" as const)
    );

    // Optimistic state for immediate UI feedback on favorite toggle
    const [optimisticFavorited, setOptimisticFavorited] = useState<
      boolean | null
    >(null);

    // Reset optimistic state when server data changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset when server value changes
    useEffect(() => {
      setOptimisticFavorited(null);
    }, [isFavoritedFromServer]);

    // Use optimistic value if set, otherwise use server value
    const isFavorited = optimisticFavorited ?? isFavoritedFromServer;

    const handleToggleFavorite = useCallback(async () => {
      if (
        !messageId ||
        isPrivateMode ||
        messageId.startsWith("private-") ||
        messageId.startsWith("optimistic-")
      ) {
        return;
      }

      // Optimistic update: toggle favorite state immediately
      const newFavoritedState = !isFavorited;
      setOptimisticFavorited(newFavoritedState);

      try {
        const result = await toggleFavorite({
          messageId: messageId as Id<"messages">,
        });
        managedToast.success(
          result.favorited ? "Added to favorites" : "Removed from favorites"
        );
      } catch {
        // Revert optimistic update on error
        setOptimisticFavorited(null);
        managedToast.error("Failed to update favorite");
      }
    }, [
      messageId,
      isPrivateMode,
      isFavorited,
      toggleFavorite,
      managedToast.success,
      managedToast.error,
    ]);

    const handleTTS = useCallback(async () => {
      if (!messageId || messageId.startsWith("optimistic-")) {
        return;
      }

      // If currently playing, stop the audio
      if (ttsState === "playing") {
        isCancelledRef.current = true; // Mark as intentionally cancelled
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // Ensure network fetch is aborted by clearing the source
          try {
            audioRef.current.src = "";
            audioRef.current.load();
          } catch {
            // no-op
          }
          audioRef.current = null;
        }
        setTtsState("idle");
        return;
      }

      // If currently loading, cancel the request
      if (ttsState === "loading") {
        isCancelledRef.current = true; // Mark as intentionally cancelled
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setTtsState("idle");
        managedToast.success("TTS generation cancelled");
        return;
      }

      // Stream TTS via server (Convex HTTP endpoint)
      try {
        isCancelledRef.current = false;
        setTtsState("loading");
        // Build signed URL from server
        const urlResult = await createTTSStreamUrl({
          messageId: messageId as Id<"messages">,
          ttlSeconds: 60,
        });

        const audioEl = new Audio();
        audioEl.preload = "auto";
        audioEl.src = urlResult.url;
        audioEl.onended = () => {
          setTtsState("idle");
          audioRef.current = null;
        };
        audioEl.onerror = () => {
          setTtsState("idle");
          audioRef.current = null;
          managedToast.error("Text-to-speech failed");
        };

        audioRef.current = audioEl;
        await audioEl.play();
        setTtsState("playing");
      } catch (error) {
        if (!isCancelledRef.current) {
          const errorMessage =
            error instanceof Error ? error.message : "TTS generation failed";
          managedToast.error(`Text-to-speech failed: ${errorMessage}`);
        }
        setTtsState("idle");
        audioRef.current = null;
        abortControllerRef.current = null;
      }
    }, [messageId, managedToast, ttsState, createTTSStreamUrl]);

    useEffect(() => {
      return () => {
        isCancelledRef.current = true; // Mark as cancelled on unmount
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      };
    }, []);

    if (isStreaming) {
      return null;
    }

    const containerClassName = cn(
      "flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
      "translate-y-0 sm:translate-y-1 sm:group-hover:translate-y-0",
      "transition-all duration-200 ease-out",
      "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms; opacity: 100; transform: none }",
      isUser && isEditing && "opacity-0 pointer-events-none translate-y-2",
      isUser ? "justify-end mt-1.5" : "mt-1.5",
      (isDropdownOpen || forceVisible) && "sm:opacity-100 sm:translate-y-0",
      className
    );

    // Check if we have overflow actions
    const hasOverflowActions =
      (!isPrivateMode && messageId && conversationId) || // Branch action
      (!isPrivateMode && messageId && !messageId.startsWith("private-")) || // Favorite action
      (!isUser && messageId) || // TTS action
      (!isUser && onOpenZenMode) || // Zen mode action
      onEditMessage; // Edit action

    const renderOverflowDrawerItems = () => (
      <>
        {onEditMessage && (
          <DrawerItem
            icon={<NotePencilIcon className={DRAWER_ICON_SIZE} />}
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              onEditMessage();
            }}
          >
            Edit message
          </DrawerItem>
        )}

        {!isPrivateMode && messageId && conversationId && (
          <BranchActionDrawerItem
            conversationId={conversationId}
            messageId={messageId}
            onSuccess={newConversationId => {
              setIsOverflowDrawerOpen(false);
              navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
            }}
          />
        )}

        {!isPrivateMode && messageId && !messageId.startsWith("private-") && (
          <DrawerItem
            icon={
              <HeartIcon
                className={cn(
                  DRAWER_ICON_SIZE,
                  isFavorited && "text-destructive"
                )}
                weight={isFavorited ? "fill" : "regular"}
              />
            }
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              handleToggleFavorite();
            }}
          >
            {isFavorited ? "Unfavorite" : "Favorite"}
          </DrawerItem>
        )}

        {!isUser && messageId && (
          <DrawerItem
            icon={getTTSIconForDrawer(ttsState)}
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              handleTTS();
            }}
          >
            {getTTSTooltip(ttsState)}
          </DrawerItem>
        )}

        {!isUser && onOpenZenMode && (
          <DrawerItem
            icon={<TextAaIcon className={DRAWER_ICON_SIZE} />}
            onClick={() => {
              setIsOverflowDrawerOpen(false);
              onOpenZenMode();
            }}
          >
            Zen mode
          </DrawerItem>
        )}
      </>
    );

    return (
      <div className={containerClassName}>
        <div className="flex items-center gap-1">
          {/* Mobile: Overflow drawer */}
          {hasOverflowActions && (
            <div className="sm:hidden">
              <Drawer
                open={isOverflowDrawerOpen}
                onOpenChange={setIsOverflowDrawerOpen}
              >
                <Tooltip>
                  <TooltipTrigger>
                    <DrawerTrigger>
                      <button
                        type="button"
                        className={cn(
                          actionButtonStyles.defaultButton,
                          isEditing && "pointer-events-none opacity-50"
                        )}
                        disabled={isEditing}
                        aria-label="More actions"
                      >
                        <DotsThreeIcon
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      </button>
                    </DrawerTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>More actions</p>
                  </TooltipContent>
                </Tooltip>

                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>More actions</DrawerTitle>
                  </DrawerHeader>
                  <DrawerBody>
                    <div className="flex flex-col">
                      {renderOverflowDrawerItems()}
                    </div>
                  </DrawerBody>
                </DrawerContent>
              </Drawer>
            </div>
          )}

          {/* Desktop: Individual action buttons */}
          <div className="hidden sm:flex sm:items-center sm:gap-1">
            {onEditMessage && (
              <ActionButtons.Edit
                disabled={isEditing}
                tooltip="Edit message"
                ariaLabel="Edit this message"
                onClick={onEditMessage}
              />
            )}

            {!isPrivateMode && messageId && conversationId && (
              <BranchActionButton
                conversationId={conversationId}
                messageId={messageId}
                isEditing={isEditing}
                onSuccess={newConversationId => {
                  navigate(ROUTES.CHAT_CONVERSATION(newConversationId));
                }}
              />
            )}

            {!isPrivateMode &&
              messageId &&
              !messageId.startsWith("private-") && (
                <ActionButtons.Favorite
                  disabled={isEditing}
                  favorited={isFavorited}
                  ariaLabel={
                    isFavorited ? "Remove from favorites" : "Add to favorites"
                  }
                  onClick={handleToggleFavorite}
                />
              )}

            {!isUser && messageId && (
              <ActionButton
                disabled={isEditing}
                tooltip={getTTSTooltip(ttsState)}
                ariaLabel={getTTSTooltip(ttsState)}
                icon={getTTSIconForButton(ttsState)}
                onClick={handleTTS}
              />
            )}

            {!isUser && onOpenZenMode && (
              <ActionButtons.ZenMode
                disabled={isEditing}
                ariaLabel="Open Zen mode"
                onClick={onOpenZenMode}
              />
            )}
          </div>

          {/* Primary actions: Copy, Retry, Delete */}
          <ActionButtons.Copy
            disabled={isEditing}
            copied={isCopied}
            tooltip="Copy message"
            ariaLabel={
              isCopied
                ? "Message copied to clipboard"
                : "Copy message to clipboard"
            }
            onClick={copyToClipboard}
          />

          {/* Image generation messages use dedicated popover */}
          {isImageGenerationMessage && onRetryImageGeneration && (
            <ImageRetryPopover
              currentModel={imageGenerationParams?.model}
              currentAspectRatio={imageGenerationParams?.aspectRatio}
              onRetry={onRetryImageGeneration}
            />
          )}

          {/* Text messages use the regular retry dropdown */}
          {!isImageGenerationMessage && onRetryMessage && (
            <RetryDropdown
              isUser={isUser}
              isRetrying={isRetrying}
              isStreaming={isStreaming}
              isEditing={isEditing}
              messageId={messageId}
              onRetry={onRetryMessage}
              onRefine={onRefineMessage}
              onDropdownOpenChange={setIsDropdownOpen}
              currentModel={model}
              currentProvider={provider}
            />
          )}

          {onDeleteMessage && (
            <ActionButtons.Delete
              disabled={isEditing || isDeleting || isStreaming}
              title="Delete message"
              ariaLabel="Delete this message permanently"
              onClick={onDeleteMessage}
            />
          )}

          {/* Metadata Display */}
          {showMetadata && tokenUsage && (
            <Popover>
              <PopoverTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1.5 px-2 text-overline font-medium text-primary sm:text-muted-foreground hover:text-foreground/80 hover:bg-muted/50"
                >
                  {/* Desktop: Show full text */}
                  <span className="hidden sm:inline">
                    {tokenUsage.totalTokens} tokens
                  </span>
                  {metadata?.tokensPerSecond && (
                    <span className="hidden sm:inline">
                      <span className="text-muted-foreground/30">&middot;</span>
                      <span>{Math.round(metadata.tokensPerSecond)} t/s</span>
                    </span>
                  )}
                  {/* Mobile: Show only icon */}
                  <ChartBarIcon
                    className="size-3.5 sm:hidden"
                    aria-hidden="true"
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start" side="top">
                <div className="stack-md">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-semibold">
                      Generation Stats
                    </span>
                    <span className="text-overline text-muted-foreground font-mono">
                      {metadata?.providerMessageId?.slice(0, 8)}
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        Input Tokens
                      </span>
                      <span className="font-mono">
                        {tokenUsage.inputTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        Output Tokens
                      </span>
                      <span className="font-mono">
                        {tokenUsage.outputTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 mt-1 font-medium">
                      <span>Total Tokens</span>
                      <span className="font-mono">
                        {tokenUsage.totalTokens.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {(metadata?.timeToFirstTokenMs ||
                    metadata?.tokensPerSecond) && (
                    <div className="grid gap-2 text-xs border-t pt-2">
                      {metadata.timeToFirstTokenMs && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Time to First Token
                          </span>
                          <span className="font-mono">
                            {metadata.timeToFirstTokenMs}ms
                          </span>
                        </div>
                      )}
                      {metadata.tokensPerSecond && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Generation Speed
                          </span>
                          <span className="font-mono">
                            {metadata.tokensPerSecond.toFixed(1)} t/s
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Citations avatar stack */}
          {!isUser &&
            citations &&
            citations.length > 0 &&
            onToggleCitations && (
              <CitationAvatarStack
                citations={citations}
                isExpanded={citationsExpanded}
                onToggle={onToggleCitations}
              />
            )}
        </div>

        {!isUser && model && provider && (
          <Badge variant="outline" size="sm" className="text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {provider !== "replicate" && (
                <ProviderIcon className="h-3 w-3" provider={provider} />
              )}
              <span className="hidden sm:inline">{modelTitle}</span>
            </div>
          </Badge>
        )}
      </div>
    );
  }
);

MessageActions.displayName = "MessageActions";
