import { api } from "@convex/_generated/api";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BookmarkSimpleIcon,
  FireIcon,
  HeartIcon,
  InfoIcon,
  ShuffleIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiscoveryLayout } from "@/components/canvas/discovery-layout";
import { Spinner } from "@/components/ui/spinner";
import { useDiscoverySessionSync } from "@/hooks";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";
import { useDiscoveryStore } from "@/stores/discovery-store";

type ReactionFlash = "liked" | "disliked" | "saved" | null;

function getSwipeExitAnimation(dir: "left" | "right" | null) {
  if (dir === "right") {
    return { x: 400, opacity: 0, rotate: 15 };
  }
  if (dir === "left") {
    return { x: -400, opacity: 0, rotate: -15 };
  }
  return { opacity: 0, scale: 0.97 };
}

function mapGenerationStatus(
  dbStatus: string
): "succeeded" | "failed" | "generating" {
  if (dbStatus === "succeeded") {
    return "succeeded";
  }
  if (dbStatus === "failed" || dbStatus === "canceled") {
    return "failed";
  }
  return "generating";
}

export function DiscoveryMode() {
  const isActive = useDiscoveryStore(s => s.isActive);
  const history = useDiscoveryStore(s => s.history);
  const currentIndex = useDiscoveryStore(s => s.currentIndex);
  const isGenerating = useDiscoveryStore(s => s.isGenerating);
  const sessionId = useDiscoveryStore(s => s.sessionId);

  const addEntry = useDiscoveryStore(s => s.addEntry);
  const updateEntry = useDiscoveryStore(s => s.updateEntry);
  const reactLike = useDiscoveryStore(s => s.reactLike);
  const reactDislike = useDiscoveryStore(s => s.reactDislike);
  const reactRemix = useDiscoveryStore(s => s.reactRemix);
  const reactWilder = useDiscoveryStore(s => s.reactWilder);
  const reactFresh = useDiscoveryStore(s => s.reactFresh);
  const saveCurrentToCollection = useDiscoveryStore(
    s => s.saveCurrentToCollection
  );
  const browseUp = useDiscoveryStore(s => s.browseUp);
  const browseDown = useDiscoveryStore(s => s.browseDown);
  const stop = useDiscoveryStore(s => s.stop);
  const isPanelVisible = useDiscoveryStore(s => s.isPanelVisible);
  const togglePanel = useDiscoveryStore(s => s.togglePanel);

  const startGeneration = useAction(api.discovery.startDiscoveryGeneration);
  const { syncReaction, syncPause } = useDiscoverySessionSync();
  const managedToast = useToast();

  const [showHud, setShowHud] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [reactionFlash, setReactionFlash] = useState<ReactionFlash>(null);
  const [swipeExit, setSwipeExit] = useState<"left" | "right" | null>(null);
  const hudTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingLockRef = useRef(false);

  const isMobile = useMediaQuery("(max-width: 640px)");

  const currentEntry = history[currentIndex] ?? null;

  // Swipe gesture state
  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-200, 0, 200], [-12, 0, 12]);
  const dragScale = useTransform(dragX, [-200, 0, 200], [0.95, 1, 0.95]);
  const likeOverlayOpacity = useTransform(dragX, [0, 80], [0, 0.4]);
  const dislikeOverlayOpacity = useTransform(dragX, [-80, 0], [0.4, 0]);

  // Reset explanation toggle when navigating between entries
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on index change only
  useEffect(() => {
    setShowExplanation(false);
  }, [currentIndex]);

  // The latest entry may be generating while the user browses history.
  // Subscribe to both the current entry AND the latest entry so status
  // updates (and isGenerating) resolve even when the user is viewing older images.
  const latestEntry = history[history.length - 1] ?? null;
  const latestIsInFlight =
    latestEntry &&
    latestEntry !== currentEntry &&
    (latestEntry.status === "pending" || latestEntry.status === "generating");

  // Subscribe to current generation status
  const generationData = useQuery(
    api.generations.getGeneration,
    currentEntry?.generationId ? { id: currentEntry.generationId } : "skip"
  );

  // Subscribe to latest in-flight generation (when user browsed away)
  const latestGenerationData = useQuery(
    api.generations.getGeneration,
    latestIsInFlight ? { id: latestEntry.generationId } : "skip"
  );

  // Update current entry when generation data changes
  useEffect(() => {
    if (!(generationData && currentEntry)) {
      return;
    }

    const newStatus = mapGenerationStatus(generationData.status);
    const newImageUrl = generationData.imageUrls?.[0] ?? null;

    if (
      newStatus !== currentEntry.status ||
      newImageUrl !== currentEntry.imageUrl
    ) {
      updateEntry(currentEntry.generationId, {
        status: newStatus,
        imageUrl: newImageUrl,
      });
    }
  }, [generationData, currentEntry, updateEntry]);

  // Update latest in-flight entry when its generation data changes
  useEffect(() => {
    if (!(latestGenerationData && latestIsInFlight)) {
      return;
    }

    const newStatus = mapGenerationStatus(latestGenerationData.status);
    const newImageUrl = latestGenerationData.imageUrls?.[0] ?? null;

    if (
      newStatus !== latestEntry.status ||
      newImageUrl !== latestEntry.imageUrl
    ) {
      updateEntry(latestEntry.generationId, {
        status: newStatus,
        imageUrl: newImageUrl,
      });
    }
  }, [latestGenerationData, latestIsInFlight, latestEntry, updateEntry]);

  // Flash a reaction icon briefly
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashReaction = useCallback((type: ReactionFlash) => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setReactionFlash(type);
    flashTimeoutRef.current = setTimeout(() => setReactionFlash(null), 500);
  }, []);

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    },
    []
  );

  // Trigger a new generation
  const triggerGeneration = useCallback(async () => {
    if (isGenerating || generatingLockRef.current) {
      return;
    }

    generatingLockRef.current = true;
    const state = useDiscoveryStore.getState();

    try {
      const result = await startGeneration({
        seedPrompt: state.seedPrompt || undefined,
        seedImageStorageId: state.seedImageStorageId ?? undefined,
        likedPrompts: state.likedPrompts,
        dislikedPrompts: state.dislikedPrompts,
        modelId: state.modelId || undefined,
        personaId: state.personaId ?? undefined,
        aspectRatio: state.aspectRatio || undefined,
        sessionId: state.sessionId,
        isFirstGeneration: state.history.length === 0,
        hint: state.hint || undefined,
      });

      addEntry({
        generationId: result.generationId,
        prompt: result.prompt,
        imageUrl: null,
        aspectRatio: result.aspectRatio ?? "1:1",
        status: "pending",
        reaction: null,
        explanation: result.explanation,
      });

      if (result.addedModelName) {
        managedToast.success(`Model added: ${result.addedModelName}`);
      }
    } catch (err) {
      console.error("Discovery generation failed:", err);
      managedToast.error("Generation failed", {
        description:
          err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      generatingLockRef.current = false;
    }
  }, [isGenerating, startGeneration, addEntry, managedToast]);

  // Auto-start first generation when a new session begins
  // biome-ignore lint/correctness/useExhaustiveDependencies: only trigger on new session
  useEffect(() => {
    if (isActive && history.length === 0) {
      triggerGeneration();
    }
  }, [sessionId]);

  // HUD auto-hide on mouse inactivity (desktop only)
  useEffect(() => {
    if (!isActive) {
      return;
    }

    // On mobile, always show HUD
    if (isMobile) {
      setShowHud(true);
      return;
    }

    const handleMouseMove = () => {
      setShowHud(true);
      if (hudTimeoutRef.current) {
        clearTimeout(hudTimeoutRef.current);
      }
      hudTimeoutRef.current = setTimeout(() => setShowHud(false), 2000);
    };

    handleMouseMove(); // show initially
    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (hudTimeoutRef.current) {
        clearTimeout(hudTimeoutRef.current);
      }
    };
  }, [isActive, isMobile]);

  const navigate = useNavigate();

  // Handle exit — pause session instead of archiving
  const handleExit = useCallback(() => {
    const { sessionId: sid } = stop();
    syncPause(sid);
    navigate(ROUTES.DISCOVER);
  }, [stop, syncPause, navigate]);

  // Like → sync + trigger next
  const handleLike = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    reactLike();
    flashReaction("liked");
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "liked"
    );
    triggerGeneration();
  }, [
    currentEntry,
    reactLike,
    flashReaction,
    syncReaction,
    sessionId,
    triggerGeneration,
  ]);

  // Dislike → sync + trigger next
  const handleDislike = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    reactDislike();
    flashReaction("disliked");
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "disliked"
    );
    triggerGeneration();
  }, [
    currentEntry,
    reactDislike,
    flashReaction,
    syncReaction,
    sessionId,
    triggerGeneration,
  ]);

  // Save → sync + flash
  const handleSave = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    saveCurrentToCollection();
    flashReaction("saved");
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "saved"
    );
  }, [
    currentEntry,
    saveCurrentToCollection,
    flashReaction,
    syncReaction,
    sessionId,
  ]);

  // Remix → same subject, different style
  const handleRemix = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    reactRemix();
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "liked"
    );
    triggerGeneration();
  }, [currentEntry, reactRemix, syncReaction, sessionId, triggerGeneration]);

  // Wilder → amplify what's working
  const handleWilder = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    reactWilder();
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "liked"
    );
    triggerGeneration();
  }, [currentEntry, reactWilder, syncReaction, sessionId, triggerGeneration]);

  // Fresh → completely new direction
  const handleFresh = useCallback(() => {
    if (!currentEntry || currentEntry.status !== "succeeded") {
      return;
    }
    reactFresh();
    syncReaction(
      sessionId,
      currentEntry.generationId,
      currentEntry.prompt,
      "disliked"
    );
    triggerGeneration();
  }, [currentEntry, reactFresh, syncReaction, sessionId, triggerGeneration]);

  // Swipe gesture handlers
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 80;
      const velocityThreshold = 300;
      const shouldSwipeRight =
        info.offset.x > threshold ||
        (info.offset.x > 0 && info.velocity.x > velocityThreshold);
      const shouldSwipeLeft =
        info.offset.x < -threshold ||
        (info.offset.x < 0 && info.velocity.x < -velocityThreshold);

      if (shouldSwipeRight) {
        setSwipeExit("right");
        handleLike();
      } else if (shouldSwipeLeft) {
        setSwipeExit("left");
        handleDislike();
      }
      // Below threshold — framer-motion springs back via dragConstraints
    },
    [handleLike, handleDislike]
  );

  // Keyboard handler
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          handleLike();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleDislike();
          break;
        case "ArrowUp":
          e.preventDefault();
          browseUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          browseDown();
          break;
        case " ":
          e.preventDefault();
          handleSave();
          break;
        case "r":
        case "R":
          e.preventDefault();
          handleRemix();
          break;
        case "w":
        case "W":
          e.preventDefault();
          handleWilder();
          break;
        case "f":
        case "F":
          e.preventDefault();
          handleFresh();
          break;
        case "Escape":
          e.preventDefault();
          handleExit();
          break;
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [
    isActive,
    handleLike,
    handleDislike,
    handleSave,
    handleRemix,
    handleWilder,
    handleFresh,
    browseUp,
    browseDown,
    handleExit,
  ]);

  if (!isActive) {
    return null;
  }

  const imageReady =
    currentEntry?.status === "succeeded" && !!currentEntry.imageUrl;

  const historyCounter =
    history.length > 0 ? `${currentIndex + 1}/${history.length}` : null;

  return (
    <DiscoveryLayout
      immersive
      showHeader={showHud}
      isPanelCollapsed={!isPanelVisible}
      onExpandPanel={togglePanel}
    >
      {/* Vertical stack: image on top, toolbar below */}
      <div className="flex flex-1 flex-col items-center justify-center w-full overflow-hidden">
        {/* Image area */}
        <div className="relative flex flex-1 items-center justify-center w-full min-h-0 px-4 sm:px-8 py-4 sm:py-8">
          {/* Unified crossfade between loading / failed / image states */}
          <AnimatePresence mode="wait">
            {/* Loading state — skeleton matching image aspect ratio */}
            {(!currentEntry ||
              currentEntry.status === "pending" ||
              currentEntry.status === "generating") && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="skeleton-surface rounded-lg flex flex-col items-center justify-center gap-3 p-6 max-w-full"
                style={{
                  aspectRatio: (currentEntry?.aspectRatio ?? "1:1").replace(
                    ":",
                    "/"
                  ),
                  maxHeight: "calc(100dvh - 12rem)",
                }}
              >
                <Spinner className="size-6 text-muted-foreground/60" />
                {currentEntry?.prompt && (
                  <p className="max-w-sm text-center text-xs text-muted-foreground/70 line-clamp-3">
                    {currentEntry.prompt}
                  </p>
                )}
              </motion.div>
            )}

            {/* Failed state */}
            {currentEntry?.status === "failed" && (
              <motion.div
                key="failed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-3 text-muted-foreground"
              >
                <p className="text-sm">Generation failed</p>
                <button
                  type="button"
                  className="text-xs underline hover:text-foreground"
                  onClick={triggerGeneration}
                >
                  Try again
                </button>
              </motion.div>
            )}

            {/* Succeeded — show image */}
            {imageReady && (
              <motion.div
                key={currentEntry.generationId}
                className="relative max-h-[calc(100dvh-12rem)] max-w-full"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={getSwipeExitAnimation(swipeExit)}
                onAnimationComplete={() => {
                  if (swipeExit) {
                    setSwipeExit(null);
                  }
                }}
                transition={{ duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={handleDragEnd}
                style={{
                  x: dragX,
                  rotate: dragRotate,
                  ...(isMobile ? { scale: dragScale } : {}),
                }}
                whileDrag={{ cursor: "grabbing" }}
              >
                {/* Swipe color overlays */}
                <motion.div
                  className="absolute inset-0 rounded-lg bg-green-500/40 pointer-events-none z-10"
                  style={{ opacity: likeOverlayOpacity }}
                />
                <motion.div
                  className="absolute inset-0 rounded-lg bg-red-500/40 pointer-events-none z-10"
                  style={{ opacity: dislikeOverlayOpacity }}
                />
                <img
                  src={currentEntry.imageUrl as string}
                  alt={currentEntry.prompt}
                  className="max-h-[calc(100dvh-12rem)] max-w-full object-contain rounded-lg shadow-xl shadow-black/25"
                  draggable={false}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reaction burst animation */}
          <AnimatePresence>
            {reactionFlash && (
              <motion.div
                key={reactionFlash}
                initial={{ opacity: 0.7, scale: 0.5 }}
                animate={{ opacity: 0, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
              >
                {reactionFlash === "liked" && (
                  <HeartIcon className="size-24 text-green-500" weight="fill" />
                )}
                {reactionFlash === "disliked" && (
                  <XIcon className="size-24 text-red-500" weight="bold" />
                )}
                {reactionFlash === "saved" && (
                  <BookmarkSimpleIcon
                    className="size-24 text-blue-500"
                    weight="fill"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reaction indicator on current entry */}
          {currentEntry?.reaction === "liked" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200 animate-in fade-in-0 zoom-in-95 duration-200">
              <HeartIcon className="size-3.5" weight="fill" />
              Liked
            </div>
          )}
          {currentEntry?.reaction === "disliked" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-200 animate-in fade-in-0 zoom-in-95 duration-200">
              <XIcon className="size-3.5" weight="bold" />
              Nope
            </div>
          )}
          {currentEntry?.reaction === "saved" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200 animate-in fade-in-0 zoom-in-95 duration-200">
              <BookmarkSimpleIcon className="size-3.5" weight="fill" />
              Saved
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex flex-col items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 pb-safe">
          {/* Prompt + explanation — only show when image is ready (loading state shows its own prompt) */}
          <AnimatePresence mode="wait">
            {imageReady && currentEntry?.prompt && (
              <motion.div
                key={currentEntry.prompt}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-1 max-w-2xl"
              >
                <p className="text-center text-xs text-muted-foreground">
                  {currentEntry.prompt}
                </p>
                {currentEntry.explanation && (
                  <button
                    type="button"
                    onClick={() => setShowExplanation(prev => !prev)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                  >
                    <InfoIcon className="size-3" />
                    {showExplanation ? "Hide" : "Why this?"}
                  </button>
                )}
                {showExplanation && currentEntry.explanation && (
                  <p className="text-center text-[11px] italic text-muted-foreground/60 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    {currentEntry.explanation}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile toolbar */}
          {isMobile ? (
            <div className="flex flex-col items-center gap-2 w-full max-w-sm">
              {/* Primary row: Nope / More */}
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handleDislike}
                  disabled={!imageReady}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-muted px-4 py-3 text-sm font-medium text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  <ArrowLeftIcon className="size-4" weight="bold" />
                  Nope
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!imageReady}
                  className="flex items-center justify-center rounded-full bg-muted px-3 py-3 text-sm text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  <BookmarkSimpleIcon className="size-4" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={!imageReady}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-muted px-4 py-3 text-sm font-medium text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  More
                  <ArrowRightIcon className="size-4" weight="bold" />
                </button>
              </div>
              {/* Secondary row: Remix / Wilder / Fresh */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRemix}
                  disabled={!imageReady}
                  className="flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  <ShuffleIcon className="size-3.5" weight="bold" />
                  Remix
                </button>
                <button
                  type="button"
                  onClick={handleWilder}
                  disabled={!imageReady}
                  className="flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  <FireIcon className="size-3.5" weight="bold" />
                  Wilder
                </button>
                <button
                  type="button"
                  onClick={handleFresh}
                  disabled={!imageReady}
                  className="flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors active:bg-accent disabled:opacity-30"
                >
                  <SparkleIcon className="size-3.5" weight="bold" />
                  Fresh
                </button>
              </div>
              {/* History nav row */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <button
                  type="button"
                  onClick={browseUp}
                  disabled={currentIndex <= 0}
                  className="rounded p-1 transition-colors active:bg-accent disabled:opacity-30"
                >
                  <ArrowUpIcon className="size-3.5" />
                </button>
                {historyCounter && (
                  <span className="tabular-nums">{historyCounter}</span>
                )}
                <button
                  type="button"
                  onClick={browseDown}
                  disabled={currentIndex >= history.length - 1}
                  className="rounded p-1 transition-colors active:bg-accent disabled:opacity-30"
                >
                  <ArrowDownIcon className="size-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Desktop toolbar */
            <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={handleDislike}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                <ArrowLeftIcon className="size-3.5" weight="bold" /> Nope
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={handleLike}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                More <ArrowRightIcon className="size-3.5" weight="bold" />
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={handleSave}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                <BookmarkSimpleIcon className="size-3.5" weight="bold" />
                Save
                <kbd className="ml-0.5 text-[10px] opacity-40">Space</kbd>
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={handleRemix}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                <ShuffleIcon className="size-3.5" weight="bold" />
                Remix
                <kbd className="ml-0.5 text-[10px] opacity-40">R</kbd>
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={handleWilder}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                <FireIcon className="size-3.5" weight="bold" />
                Wilder
                <kbd className="ml-0.5 text-[10px] opacity-40">W</kbd>
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={handleFresh}
                disabled={!imageReady}
                className="flex items-center gap-1 rounded-full px-3 py-1 transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              >
                <SparkleIcon className="size-3.5" weight="bold" />
                Fresh
                <kbd className="ml-0.5 text-[10px] opacity-40">F</kbd>
              </button>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-1 px-2 py-1">
                <ArrowUpIcon className="size-3" />
                <ArrowDownIcon className="size-3" /> Browse
                {historyCounter && (
                  <span className="ml-1 tabular-nums text-muted-foreground/50">
                    {historyCounter}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </DiscoveryLayout>
  );
}
