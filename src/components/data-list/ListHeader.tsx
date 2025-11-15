import { cn } from "@/lib/utils";

interface ListHeaderProps {
  children: React.ReactNode;
  className?: string;
  /**
   * CSS grid-template-columns value for column layout.
   * Automatically aligns with ListRow cells when using the same template.
   */
  gridTemplate?: string;
}

export function ListHeader({
  children,
  className,
  gridTemplate,
}: ListHeaderProps) {
  return (
    <div className={cn("bg-muted/50 border-b", className)}>
      <div
        className="grid items-center gap-4 p-4"
        style={gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
