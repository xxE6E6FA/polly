import { cn } from "@/lib/utils";

interface ListHeaderProps {
  children: React.ReactNode;
  className?: string;
  /**
   * CSS grid-template-columns value for column layout.
   * Automatically aligns with ListRow cells when using the same template.
   */
  gridTemplate?: string;
  /**
   * Make the header sticky when scrolling
   */
  sticky?: boolean;
  /**
   * Offset from the top when sticky (in pixels)
   * Use to position below other sticky elements like nav
   */
  stickyOffset?: number;
}

export function ListHeader({
  children,
  className,
  gridTemplate,
  sticky = false,
  stickyOffset = 0,
}: ListHeaderProps) {
  return (
    <div
      className={cn(
        "bg-muted/50 border-b",
        sticky && "sticky z-sticky bg-background",
        className
      )}
      style={sticky ? { top: stickyOffset } : undefined}
    >
      <div
        className="grid items-center gap-4 p-4"
        style={gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
