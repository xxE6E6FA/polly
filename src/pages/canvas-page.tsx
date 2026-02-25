import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { PanelLeftIcon } from "@/components/animate-ui/icons/panel-left";
import {
  CanvasGenerateButton,
  CanvasGenerationForm,
} from "@/components/canvas/canvas-generation-form";
import { CanvasMasonryGrid } from "@/components/canvas/canvas-masonry-grid";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { ROUTES } from "@/lib/routes";
import type { CanvasFilterMode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";

function CanvasGateCheck({ children }: { children: React.ReactNode }) {
  const { hasReplicateApiKey, isLoading } = useReplicateApiKey();

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!hasReplicateApiKey) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="mx-auto max-w-md text-center stack-md">
          <h2 className="text-lg font-semibold">Replicate API Key Required</h2>
          <p className="text-sm text-muted-foreground">
            Canvas mode uses your Replicate API key for image generation. Add
            your key in settings to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to={ROUTES.HOME}>
              <Button variant="ghost" size="sm">
                Back to Chat
              </Button>
            </Link>
            <Link to={ROUTES.SETTINGS.API_KEYS}>
              <Button size="sm">Add API Key</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const FILTER_OPTIONS: { label: string; value: CanvasFilterMode }[] = [
  { label: "All", value: "all" },
  { label: "Canvas", value: "canvas" },
  { label: "Conversations", value: "conversations" },
];

export default function CanvasPage() {
  const filterMode = useCanvasStore(s => s.filterMode);
  const setFilterMode = useCanvasStore(s => s.setFilterMode);
  const panelWidth = useCanvasStore(s => s.panelWidth);
  const setPanelWidth = useCanvasStore(s => s.setPanelWidth);
  const setIsResizing = useCanvasStore(s => s.setIsResizing);
  const resetPanelWidth = useCanvasStore(s => s.resetPanelWidth);
  const isPanelVisible = useCanvasStore(s => s.isPanelVisible);
  const togglePanel = useCanvasStore(s => s.togglePanel);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        setPanelWidth(startWidth + deltaX);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.documentElement.classList.remove("select-none");
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.documentElement.classList.add("select-none");
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth, setPanelWidth, setIsResizing]
  );

  const handleDoubleClick = useCallback(() => {
    resetPanelWidth();
  }, [resetPanelWidth]);

  return (
    <CanvasGateCheck>
      <div className="flex h-[100dvh] bg-background">
        {/* Expand zone when panel is hidden */}
        {!isPanelVisible && (
          <button
            type="button"
            aria-label="Expand panel"
            className="fixed inset-y-0 left-0 z-sidebar w-5 cursor-e-resize bg-transparent transition-colors duration-200 hover:bg-muted/40"
            onClick={togglePanel}
          />
        )}

        {/* Side panel (left) — matches main sidebar styling */}
        <aside
          className="relative flex flex-col shrink-0 bg-sidebar dark:bg-sidebar border-r border-border/40 transition-[width] duration-300 ease-out overflow-hidden"
          style={{ width: isPanelVisible ? panelWidth : 0 }}
        >
          {/* Panel header — mirrors sidebar header structure */}
          <div className="shrink-0 py-4 px-3">
            <div className="flex items-center justify-between mb-4 pl-2 pr-2">
              <div className="flex items-center gap-2">
                <Link
                  className="group flex items-center gap-2 text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors"
                  to={ROUTES.HOME}
                >
                  <ArrowLeftIcon className="size-4.5" />
                  <span className="font-semibold text-sm tracking-tight">
                    Canvas
                  </span>
                </Link>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  title="Collapse panel"
                  variant="ghost"
                  className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover h-8 w-8"
                  onClick={togglePanel}
                >
                  <PanelLeftIcon animateOnHover className="size-4.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 scrollbar-thin min-h-0">
            <CanvasGenerationForm />
          </div>

          {/* Fixed generate button footer */}
          <div className="shrink-0 border-t border-border/40 px-3 py-3">
            <CanvasGenerateButton />
          </div>

          {/* Resize handle */}
          {isPanelVisible && (
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/10 active:bg-primary/20 transition-colors z-10 group"
              onMouseDown={handleResizeStart}
              onDoubleClick={handleDoubleClick}
            >
              <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-transparent group-hover:bg-border/50 transition-colors" />
            </div>
          )}
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-border/40 px-4 py-3 shrink-0">
            {/* Show expand button when panel is hidden */}
            {!isPanelVisible && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={togglePanel}
              >
                <PanelLeftIcon className="size-4" />
              </Button>
            )}

            {/* Filter toggle — left side */}
            <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterMode === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setFilterMode(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </header>

          {/* Masonry grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <CanvasMasonryGrid filterMode={filterMode} />
          </div>
        </div>
      </div>
    </CanvasGateCheck>
  );
}
