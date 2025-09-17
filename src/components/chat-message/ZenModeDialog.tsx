import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types";

const ZEN_HEADER_CONDENSE_OFFSET = 48;
const ZEN_HEADER_HIDE_THRESHOLD = 96;
const ZEN_HEADER_SCROLLED_DELTA = 6;
const ZEN_CONTENT_SCROLL_PADDING = 48;

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
  const [isHeaderCondensed, setIsHeaderCondensed] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const baseHeaderHeight = headerHeight || 112;
  const contentTopPadding = baseHeaderHeight + ZEN_CONTENT_SCROLL_PADDING;
  const contentBottomPadding = ZEN_CONTENT_SCROLL_PADDING;

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

  const headerButtonClass = cn(
    "h-8 w-8 rounded-full border border-black/10 text-base transition focus-visible:ring-black/25 disabled:opacity-40 disabled:pointer-events-none dark:border-white/15 dark:focus-visible:ring-white/25",
    isHeaderCondensed
      ? "bg-black/5 text-black/70 hover:bg-black/10 hover:text-black/90 dark:bg-white/10 dark:text-white/85 dark:hover:bg-white/20 dark:hover:text-white"
      : "bg-white/60 text-black/60 hover:bg-black/10 hover:text-black/80 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20 dark:hover:text-white/90"
  );

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const currentScrollTop = container.scrollTop;
    const shouldCondense = currentScrollTop > ZEN_HEADER_CONDENSE_OFFSET;

    setIsHeaderCondensed(prev =>
      prev === shouldCondense ? prev : shouldCondense
    );

    if (!shouldCondense) {
      setIsHeaderHidden(false);
      lastScrollTopRef.current = currentScrollTop;
      return;
    }

    const lastScrollTop = lastScrollTopRef.current;
    const delta = currentScrollTop - lastScrollTop;

    if (
      delta > ZEN_HEADER_SCROLLED_DELTA &&
      currentScrollTop > ZEN_HEADER_HIDE_THRESHOLD
    ) {
      setIsHeaderHidden(true);
    } else if (delta < -ZEN_HEADER_SCROLLED_DELTA) {
      setIsHeaderHidden(false);
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  const closeZenMode = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] bg-neutral-900/60 backdrop-blur-md transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-[70] m-0 flex h-full w-full flex-col overflow-hidden p-0",
            "focus:outline-none"
          )}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f6f2ea] text-[#23211f] dark:bg-[#111012] dark:text-[#f1ece4]">
            <div className="relative z-[1] flex h-full flex-col overflow-hidden">
              <header
                ref={headerRef}
                className={cn(
                  "fixed inset-x-0 z-[70] flex items-center justify-between gap-3 border-b border-black/5 px-5 transition-[top,opacity,padding] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] sm:px-10 dark:border-white/10",
                  "transform-gpu backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-xl",
                  isHeaderCondensed
                    ? "bg-white/70 supports-[backdrop-filter]:bg-white/45 py-2.5 dark:bg-[#11111a]/70 dark:supports-[backdrop-filter]:bg-[#11111a]/45"
                    : "bg-white/55 supports-[backdrop-filter]:bg-white/35 py-5 sm:py-7 dark:bg-[#11111a]/60 dark:supports-[backdrop-filter]:bg-[#11111a]/40",
                  isHeaderHidden &&
                    "pointer-events-none opacity-0 border-transparent"
                )}
                style={{ top: `${isHeaderHidden ? -baseHeaderHeight : 0}px` }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {showNavigation && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={() => onNavigate?.("prev")}
                        disabled={!hasPrev}
                        aria-label="Previous assistant message"
                      >
                        <ArrowLeftIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={headerButtonClass}
                        onClick={() => onNavigate?.("next")}
                        disabled={!hasNext}
                        aria-label="Next assistant message"
                      >
                        <ArrowRightIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2
                      className={cn(
                        "truncate font-heading font-semibold tracking-[-0.008em] text-black/70 transition-all duration-300 dark:text-neutral-100",
                        isHeaderCondensed
                          ? "text-[1.05rem] sm:text-[1.2rem]"
                          : "text-[1.25rem] sm:text-[1.6rem]"
                      )}
                    >
                      {conversationTitle || "Untitled conversation"}
                    </h2>
                    {showCounter && (
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] text-black/55 transition-all duration-300 dark:border-white/15 dark:text-neutral-200",
                          isHeaderCondensed &&
                            "text-black/70 dark:text-neutral-100"
                        )}
                        aria-label={`Assistant message ${position} of ${totalMessages}`}
                      >
                        {position}/{totalMessages}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {estimatedReadingMinutes > 0 && (
                    <span
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-[0.16em] text-black/45 transition-all duration-300 sm:text-xs dark:text-neutral-400",
                        isHeaderCondensed &&
                          "text-black/60 dark:text-neutral-200"
                      )}
                    >
                      {estimatedReadingMinutes} min read
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeZenMode}
                    className={cn(headerButtonClass, "font-semibold")}
                    aria-label="Close Zen Mode"
                  >
                    ×
                  </Button>
                </div>
              </header>
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
                      className="stack-xl font-serif text-pretty mx-auto w-full max-w-3xl leading-[1.4] pb-20 sm:pb-28"
                    >
                      <StreamingMarkdown
                        isStreaming={isStreaming}
                        messageId={zenMessageId}
                        className="zen-prose !max-w-none font-serif tracking-[0.001em]"
                      >
                        {content}
                      </StreamingMarkdown>
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
