import { cn } from "@/lib/utils";

interface ListRowProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  /**
   * CSS grid-template-columns value for column layout.
   * Should match ListHeader's gridTemplate for proper alignment.
   */
  gridTemplate?: string;
}

export function ListRow({
  children,
  selected = false,
  onClick,
  className,
  gridTemplate,
}: ListRowProps) {
  return (
    <div
      className={cn(
        "group transition-all hover:bg-muted/30",
        selected && "bg-primary/5",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
