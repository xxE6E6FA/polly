import { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

function noop() {
  // intentionally empty
}

// ---------------------------------------------------------------------------
// PollyBrand — extracted logo used across all sidebars
// ---------------------------------------------------------------------------

const pollyLogoStyle: React.CSSProperties = {
  maskImage: "url('/favicon.svg')",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: "url('/favicon.svg')",
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
};

export function PollyBrand({ className }: { className?: string }) {
  return (
    <Link
      className={cn(
        "group flex items-center gap-2 text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors",
        className
      )}
      to={ROUTES.HOME}
      viewTransition
    >
      <div
        className="polly-logo-gradient-unified flex-shrink-0 w-6 h-6"
        style={pollyLogoStyle}
      />
      <span className="font-semibold text-sm tracking-tight">Polly</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// useResizeDrag — shared drag-to-resize logic
// ---------------------------------------------------------------------------

interface UseResizeDragOptions {
  width: number;
  onWidthChange: (width: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  /** Which side the handle sits on — determines drag direction */
  side?: "left" | "right";
}

export function useResizeDrag({
  width,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  side = "left",
}: UseResizeDragOptions) {
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onResizeStart?.();

      const startX = e.clientX;
      const startWidth = widthRef.current;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const newWidth =
          side === "left" ? startWidth + deltaX : startWidth - deltaX;
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        onResizeEnd?.();
        document.documentElement.classList.remove("select-none");
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.documentElement.classList.add("select-none");
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onWidthChange, onResizeStart, onResizeEnd, side]
  );

  return handleMouseDown;
}

// ---------------------------------------------------------------------------
// SidebarShell — Root aside container
// ---------------------------------------------------------------------------

interface SidebarShellProps {
  width: number;
  resizable?: boolean;
  onWidthChange?: (width: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  onDoubleClickHandle?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
  side?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}

export function SidebarShell({
  width,
  resizable = false,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  onDoubleClickHandle,
  collapsed = false,
  onExpand,
  side = "left",
  className,
  children,
}: SidebarShellProps) {
  const handleMouseDown = useResizeDrag({
    width,
    onWidthChange: onWidthChange ?? noop,
    onResizeStart,
    onResizeEnd,
    side,
  });

  const borderClass = side === "left" ? "border-r" : "border-l";

  return (
    <>
      {/* Expand zone when collapsed */}
      {collapsed && onExpand && (
        <button
          type="button"
          aria-label="Expand panel"
          className={cn(
            "fixed inset-y-0 z-sidebar w-5 cursor-e-resize bg-transparent transition-colors duration-200 hover:bg-muted/40",
            side === "left" ? "left-0" : "right-0"
          )}
          onClick={onExpand}
        />
      )}

      <aside
        className={cn(
          "relative flex flex-col shrink-0 bg-sidebar dark:bg-sidebar text-sidebar-foreground",
          borderClass,
          "border-border/40 transition-[width] duration-300 ease-out overflow-hidden",
          className
        )}
        style={{ width: collapsed ? 0 : width }}
      >
        {children}

        {/* Resize handle */}
        {resizable && onWidthChange && !collapsed && (
          <div
            className={cn(
              "absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/10 active:bg-primary/20 transition-colors z-10 group",
              side === "left" ? "right-0" : "left-0"
            )}
            onMouseDown={handleMouseDown}
            onDoubleClick={onDoubleClickHandle}
          >
            <div
              className={cn(
                "absolute top-0 bottom-0 w-[1px] bg-transparent group-hover:bg-border/50 transition-colors",
                side === "left" ? "right-0" : "left-0"
              )}
            />
          </div>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// SidebarShellHeader — Top section with optional PollyBrand
// ---------------------------------------------------------------------------

interface SidebarShellHeaderProps {
  children?: React.ReactNode;
  showLogo?: boolean;
  className?: string;
}

export function SidebarShellHeader({
  children,
  showLogo = true,
  className,
}: SidebarShellHeaderProps) {
  return (
    <div className={cn("shrink-0 py-4 px-3", className)}>
      <div
        className={cn(
          "flex items-center pl-2 pr-2",
          showLogo ? "justify-between" : "gap-2"
        )}
      >
        {showLogo && (
          <div className="flex items-center gap-2">
            <PollyBrand />
          </div>
        )}
        {children && (
          <div
            className={cn("flex items-center", showLogo ? "gap-1" : "gap-2")}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarShellContent — Scrollable middle section
// ---------------------------------------------------------------------------

interface SidebarShellContentProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarShellContent({
  children,
  className,
}: SidebarShellContentProps) {
  return (
    <div className={cn("flex-1 overflow-y-auto min-h-0", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarShellFooter — Bottom pinned section
// ---------------------------------------------------------------------------

interface SidebarShellFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarShellFooter({
  children,
  className,
}: SidebarShellFooterProps) {
  return (
    <div className={cn("shrink-0 border-t border-border/50", className)}>
      {children}
    </div>
  );
}
