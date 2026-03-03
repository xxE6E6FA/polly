import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CompassIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiscoveryLayout } from "@/components/canvas/discovery-layout";
import { FileLibraryButton } from "@/components/chat/input/file-library-button";
import { FileUploadButton } from "@/components/chat/input/file-upload-button";
import { PersonaPicker } from "@/components/chat/input/pickers/persona-picker";
import { AttachmentStrip } from "@/components/chat/message/attachment-strip";
import { Button } from "@/components/ui/button";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useDiscoverySessionSync } from "@/hooks/use-discovery-session-sync";
import { ROUTES } from "@/lib/routes";
import { useDiscoveryStore } from "@/stores/discovery-store";

export default function DiscoveryPage() {
  const [seedPrompt, setSeedPrompt] = useState("");
  const [personaId, setPersonaId] = useState<Id<"personas"> | null>(null);
  const [seedImageStorageId, setSeedImageStorageId] =
    useState<Id<"_storage"> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const startDiscovery = useDiscoveryStore(s => s.start);
  const isPanelVisible = useDiscoveryStore(s => s.isPanelVisible);
  const togglePanel = useDiscoveryStore(s => s.togglePanel);
  const { persistNewSession, syncPause } = useDiscoverySessionSync();

  // If we land on the entry form while a session is active (e.g. "New" button),
  // pause and stop the current session
  useEffect(() => {
    const state = useDiscoveryStore.getState();
    if (state.isActive) {
      const { sessionId } = state.stop();
      syncPause(sessionId);
    }
  }, [syncPause]);

  // Read attachments from the shared chat scoped state (file upload/library buttons write here)
  const { attachments, setAttachmentsForKey } = useChatScopedState();

  // Sync first image attachment storageId to local state for discovery
  useEffect(() => {
    const imageAttachment = attachments.find(
      a => a.storageId && a.mimeType?.startsWith("image/")
    );
    setSeedImageStorageId(
      (imageAttachment?.storageId as Id<"_storage">) ?? null
    );
  }, [attachments]);

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      setAttachmentsForKey(prev => prev.filter((_, i) => i !== index));
    },
    [setAttachmentsForKey]
  );

  const handleStart = useCallback(() => {
    startDiscovery({
      personaId: personaId ?? undefined,
      seedPrompt: seedPrompt.trim() || undefined,
      seedImageStorageId: seedImageStorageId ?? undefined,
    });
    // Persist new session to DB
    const state = useDiscoveryStore.getState();
    persistNewSession({
      sessionId: state.sessionId,
      modelId: "",
      aspectRatio: "1:1",
      seedPrompt: seedPrompt.trim() || undefined,
      seedImageStorageId: seedImageStorageId ?? undefined,
      personaId: personaId ?? undefined,
    });
    // Clean up shared state
    setAttachmentsForKey([]);
    // Navigate to session route
    navigate(ROUTES.DISCOVER_SESSION(state.sessionId));
  }, [
    personaId,
    seedPrompt,
    seedImageStorageId,
    startDiscovery,
    persistNewSession,
    setAttachmentsForKey,
    navigate,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleStart();
      }
    },
    [handleStart]
  );

  const hintItems = [
    {
      icon: <ArrowRightIcon className="size-3" />,
      label: "Like",
    },
    {
      icon: <ArrowLeftIcon className="size-3" />,
      label: "Nope",
    },
    {
      icon: <span className="text-[10px] font-medium leading-none">Space</span>,
      label: "Save",
    },
    {
      icon: (
        <span className="flex items-center gap-0.5">
          <ArrowUpIcon className="size-3" />
          <ArrowDownIcon className="size-3" />
        </span>
      ),
      label: "Browse",
    },
    {
      icon: <span className="text-[10px] font-medium leading-none">Esc</span>,
      label: "Exit",
    },
  ];

  return (
    <DiscoveryLayout
      isPanelCollapsed={!isPanelVisible}
      onExpandPanel={togglePanel}
    >
      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 sm:pb-32">
        <div className="w-full max-w-xl stack-lg">
          {/* Title */}
          <div className="stack-xs text-center">
            <div className="flex items-center justify-center gap-2 text-foreground/80">
              <CompassIcon className="size-5" weight="duotone" />
              <h1 className="text-lg font-medium tracking-tight">Discover</h1>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Keyboard-driven image exploration. Like or dislike to steer the
              aesthetic.
            </p>
          </div>

          {/* Input area — chat-input style */}
          <div className="chat-input-container">
            {/* Attachment thumbnails */}
            <AttachmentStrip
              attachments={attachments}
              onRemove={handleRemoveAttachment}
              className="mt-0 flex-nowrap overflow-x-auto px-4 pt-3 pb-0"
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder="Describe a mood, subject, or style..."
              value={seedPrompt}
              onChange={e => setSeedPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <PersonaPicker
                  compact
                  selectedPersonaId={personaId}
                  onPersonaSelect={setPersonaId}
                />
              </div>

              <div className="flex items-center gap-0.5 sm:gap-2">
                <FileUploadButton
                  disabled={false}
                  isSubmitting={false}
                  selectedModel={{ supportsImages: true }}
                />
                <FileLibraryButton
                  disabled={false}
                  isSubmitting={false}
                  selectedModel={{ supportsImages: true }}
                />
                <Button
                  size="sm"
                  className="gap-1.5 rounded-full px-4"
                  onClick={handleStart}
                  disabled={false}
                >
                  <PlayIcon className="size-3.5" weight="fill" />
                  Start
                </Button>
              </div>
            </div>
          </div>

          {/* Keyboard shortcuts — hidden on mobile, staggered animation */}
          <motion.div
            className="hidden sm:flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground/40"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {hintItems.map(item => (
              <motion.span
                key={item.label}
                className="flex items-center gap-1.5"
                variants={{
                  hidden: { opacity: 0, y: 4 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <span className="flex items-center justify-center rounded border border-muted-foreground/15 bg-muted/30 px-1.5 py-0.5 text-muted-foreground/50">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </motion.span>
            ))}
          </motion.div>
        </div>
      </div>
    </DiscoveryLayout>
  );
}
