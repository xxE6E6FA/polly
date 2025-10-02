import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Citations } from "@/components/citations";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types";
import { useZenDisplaySettings } from "./use-zen-display-settings";
import { ZenModeHeader } from "./ZenModeHeader";

const ZEN_HEADER_CONDENSE_OFFSET = 48;
const ZEN_HEADER_HIDE_THRESHOLD = 96;
const ZEN_HEADER_SCROLLED_DELTA = 6;
const ZEN_CONTENT_SCROLL_PADDING = 48;
const ZEN_EXIT_ANIMATION_MS = 320;

type ZenModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationTitle?: string;
  content?: string | null;
  citations?: ChatMessageType["citations"];
  isStreaming: boolean;
  messageId: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onNavigate?: (direction: "prev" | "next") => boolean;
  position?: number;
  totalMessages?: number;
};

export const ZenModeDialog = ({
  open,
  onOpenChange,
  conversationTitle,
  content,
  citations,
  isStreaming,
  messageId,
  hasPrev = false,
  hasNext = false,
  onNavigate,
  position,
  totalMessages,
}: ZenModeDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(open);
  const [isHeaderCondensed, setIsHeaderCondensed] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  const previousOpenPropRef = useRef(open);
  const baseHeaderHeight = headerHeight || 112;
  const contentTopPadding = baseHeaderHeight + ZEN_CONTENT_SCROLL_PADDING;
  const contentBottomPadding = ZEN_CONTENT_SCROLL_PADDING;

  const displaySettingsControls = useZenDisplaySettings();
  const { widthClass, fontFamilyClass, trackingClass, zenTypographyStyle } =
    displaySettingsControls;

  const zenMessageId = useMemo(() => `${messageId}-zen`, [messageId]);
  const estimatedReadingMinutes = useMemo(() => {
    if (!content) {
      return 0;
    }
    const wordCount = content
      .split(/\s+/)
      .map(w => w.trim())
      .filter(Boolean).length;
    if (wordCount === 0) {
      return 0;
    }
    return Math.max(1, Math.round(wordCount / 220));
  }, [content]);

  const showNavigation = Boolean(onNavigate) && (totalMessages ?? 0) > 1;
  const showCounter = showNavigation && typeof position === "number";

  useEffect(() => {
    if (!open) {
      setIsHeaderCondensed(false);
      setIsHeaderHidden(false);
      setHeaderHeight(0);
      setIsDisplayOptionsOpen(false);
      lastScrollTopRef.current = 0;
    }
  }, [open]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: 0, behavior: "auto" });
    setIsHeaderCondensed(false);
    setIsHeaderHidden(false);
    lastScrollTopRef.current = 0;
  }, []);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const headerEl = headerRef.current;
    if (!headerEl) {
      return;
    }

    const updateHeight = () => {
      const measuredHeight = headerEl.scrollHeight;
      setHeaderHeight(prev => (measuredHeight > 0 ? measuredHeight : prev));
    };

    updateHeight();

    const supportsResizeObserver = typeof ResizeObserver !== "undefined";

    if (supportsResizeObserver) {
      const resizeObserver = new ResizeObserver(() => updateHeight());
      resizeObserver.observe(headerEl);
      return () => resizeObserver.disconnect();
    }

    const handleResize = () => updateHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  useEffect(() => {
    if (!(open && onNavigate)) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "ArrowLeft") {
        const moved = onNavigate("prev");
        if (moved) {
          event.preventDefault();
        }
      } else if (event.key === "ArrowRight") {
        const moved = onNavigate("next");
        if (moved) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onNavigate]);

  const handleTopEdgePointerEnter = useCallback(() => {
    if (isHeaderHidden) {
      setIsHeaderHidden(false);
    }
  }, [isHeaderHidden]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const currentScrollTop = container.scrollTop;
    const lastScrollTop = lastScrollTopRef.current;
    const delta = currentScrollTop - lastScrollTop;

    if (isDisplayOptionsOpen && Math.abs(delta) > ZEN_HEADER_SCROLLED_DELTA) {
      setIsDisplayOptionsOpen(false);
    }

    const shouldCondense = currentScrollTop > ZEN_HEADER_CONDENSE_OFFSET;

    setIsHeaderCondensed(prev =>
      prev === shouldCondense ? prev : shouldCondense
    );

    if (!shouldCondense) {
      setIsHeaderHidden(false);
      lastScrollTopRef.current = currentScrollTop;
      return;
    }

    if (
      delta > ZEN_HEADER_SCROLLED_DELTA &&
      currentScrollTop > ZEN_HEADER_HIDE_THRESHOLD
    ) {
      setIsHeaderHidden(true);
    } else if (delta < -ZEN_HEADER_SCROLLED_DELTA) {
      setIsHeaderHidden(false);
    }

    lastScrollTopRef.current = currentScrollTop;
  }, [isDisplayOptionsOpen]);

  const closeZenMode = useCallback(() => {
    setInternalOpen(false);
  }, []);

  useEffect(() => {
    if (open === previousOpenPropRef.current) {
      return;
    }
    previousOpenPropRef.current = open;
    setInternalOpen(open);
  }, [open]);

  useEffect(() => {
    if (internalOpen) {
      if (typeof window !== "undefined" && closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = null;
      return;
    }

    if (!open) {
      return;
    }

    if (typeof window === "undefined") {
      onOpenChange(false);
      return;
    }

    if (closeTimerRef.current !== null) {
      return;
    }

    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onOpenChange(false);
    }, ZEN_EXIT_ANIMATION_MS);
  }, [internalOpen, onOpenChange, open]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setInternalOpen(true);
        if (!open) {
          onOpenChange(true);
        }
        return;
      }
      setInternalOpen(false);
    },
    [onOpenChange, open]
  );

  return (
    <Dialog open={internalOpen} onOpenChange={handleDialogOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] bg-neutral-900/60 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-300 data-[state=closed]:duration-200" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-[70] m-0 flex h-full w-full flex-col overflow-hidden p-0",
            "transform-gpu origin-bottom sm:origin-center",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
            "sm:data-[state=open]:slide-in-from-top-[4%] sm:data-[state=closed]:slide-out-to-top-[4%]",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
            "data-[state=open]:duration-500 data-[state=closed]:duration-300 ease-out",
            "focus:outline-none"
          )}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f6f2ea] text-[#23211f] dark:bg-[#111012] dark:text-[#f1ece4]">
            <div className="relative z-[1] flex h-full flex-col overflow-hidden">
              <div
                aria-hidden="true"
                className="fixed inset-x-0 z-[69]"
                onPointerEnter={handleTopEdgePointerEnter}
                style={{
                  top: 0,
                  height: baseHeaderHeight,
                  pointerEvents: isHeaderHidden ? "auto" : "none",
                }}
              />
              <ZenModeHeader
                ref={headerRef}
                conversationTitle={conversationTitle}
                showNavigation={showNavigation}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onNavigate={onNavigate}
                showCounter={showCounter}
                position={position}
                totalMessages={totalMessages}
                estimatedReadingMinutes={estimatedReadingMinutes}
                isHeaderCondensed={isHeaderCondensed}
                isHeaderHidden={isHeaderHidden}
                baseHeaderHeight={baseHeaderHeight}
                onClose={closeZenMode}
                displaySettingsControls={displaySettingsControls}
                isDisplayOptionsOpen={isDisplayOptionsOpen}
                onDisplayOptionsOpenChange={setIsDisplayOptionsOpen}
              />
              <section className="relative flex-1 overflow-hidden">
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="relative flex h-full w-full overflow-y-auto px-0"
                  style={{
                    paddingTop: contentTopPadding,
                    paddingBottom: contentBottomPadding,
                  }}
                >
                  <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 pb-16 sm:px-10 sm:pb-18">
                    <article
                      data-message-id={zenMessageId}
                      className={cn(
                        "stack-xl text-pretty mx-auto w-full pb-20 transition-[max-width] duration-300 sm:pb-28",
                        widthClass,
                        fontFamilyClass
                      )}
                    >
                      <div
                        className={cn("zen-prose", fontFamilyClass)}
                        style={zenTypographyStyle}
                      >
                        <StreamingMarkdown
                          isStreaming={isStreaming}
                          messageId={zenMessageId}
                          className={cn(
                            "!max-w-none text-current",
                            trackingClass
                          )}
                        >
                          {content ?? ""}
                        </StreamingMarkdown>
                      </div>
                    </article>

                    {citations && citations.length > 0 && (
                      <aside className="mx-auto w-full max-w-3xl rounded-3xl border border-black/8 bg-white/80 p-6 shadow-[0_35px_60px_-45px_rgba(31,37,55,0.55)] backdrop-blur dark:border-white/10 dark:bg-white/10 dark:shadow-[0_35px_60px_-45px_rgba(0,0,0,0.65)]">
                        <Citations
                          citations={citations}
                          messageId={zenMessageId}
                          content={content || undefined}
                          className="mt-0 text-black/70 [&_*]:text-black/70 [&_a]:text-sky-700 [&_a:hover]:text-sky-900 dark:text-white/80 dark:[&_*]:text-white/80 dark:[&_a]:text-sky-300 dark:[&_a:hover]:text-sky-200"
                        />
                      </aside>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};
