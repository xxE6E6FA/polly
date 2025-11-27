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
   * Top offset for sticky positioning (in pixels).
   * Should match the height of any sticky headers above this component.
   * @default 68
   */
  stickyTop?: number;
}

export function ListHeader({
  children,
  className,
  gridTemplate,
  stickyTop = 68,
}: ListHeaderProps) {
  return (
    <div
      className={cn(
        "bg-muted/50 border-b sticky z-sticky bg-background",
        className
      )}
      style={{ top: stickyTop }}
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
