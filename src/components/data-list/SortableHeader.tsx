import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { SortDirection } from "@/hooks/use-list-sort";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<TField extends string> {
  field: TField;
  children: React.ReactNode;
  sortField: TField | null;
  sortDirection: SortDirection;
  onSort: (field: TField) => void;
  className?: string;
  /**
   * @deprecated Width is now controlled by the grid template. Use className for styling only.
   */
  width?: string;
  icons?: {
    asc: React.ComponentType<{ className?: string }>;
    desc: React.ComponentType<{ className?: string }>;
  };
}

export function SortableHeader<TField extends string>({
  field,
  children,
  sortField,
  sortDirection,
  onSort,
  className,
  icons,
}: SortableHeaderProps<TField>) {
  const isActive = sortField === field;
  const AscIcon = icons?.asc ?? CaretUp;
  const DescIcon = icons?.desc ?? CaretDown;

  return (
    <div className={cn(className)}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
        type="button"
      >
        {children}
        {isActive && (
          <>
            {sortDirection === "asc" && <AscIcon className="h-3 w-3" />}
            {sortDirection === "desc" && <DescIcon className="h-3 w-3" />}
          </>
        )}
      </button>
    </div>
  );
}
