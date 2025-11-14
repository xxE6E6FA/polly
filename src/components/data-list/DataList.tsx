import { CheckIcon } from "@phosphor-icons/react";
import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortDirection } from "@/hooks/use-list-sort";
import { cn } from "@/lib/utils";

// ============================================================================
// Container Components
// ============================================================================

interface ListContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ListContainer({ children, className }: ListContainerProps) {
  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {children}
    </div>
  );
}

// ============================================================================
// Header Components
// ============================================================================

interface ListHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function ListHeader({ children, className }: ListHeaderProps) {
  return (
    <div className={cn("bg-muted/50 border-b", className)}>
      <div className="flex items-center p-4">{children}</div>
    </div>
  );
}

interface ListHeaderCellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function ListHeaderCell({
  children,
  className,
  width,
}: ListHeaderCellProps) {
  return (
    <div className={cn("text-sm font-medium", width, className)}>
      {children}
    </div>
  );
}

interface SortableHeaderProps<TField extends string> {
  field: TField;
  children: React.ReactNode;
  sortField: TField | null;
  sortDirection: SortDirection;
  onSort: (field: TField) => void;
  className?: string;
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
  width,
  icons,
}: SortableHeaderProps<TField>) {
  const isActive = sortField === field;
  const AscIcon = icons?.asc;
  const DescIcon = icons?.desc;

  return (
    <div className={cn(width, className)}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
        type="button"
      >
        {children}
        {isActive && (
          <>
            {sortDirection === "asc" && AscIcon && (
              <AscIcon className="h-3 w-3" />
            )}
            {sortDirection === "desc" && DescIcon && (
              <DescIcon className="h-3 w-3" />
            )}
          </>
        )}
      </button>
    </div>
  );
}

interface SelectAllCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}

export function SelectAllCheckbox({
  checked,
  onToggle,
  className,
}: SelectAllCheckboxProps) {
  return (
    <div className={cn("w-8 flex-shrink-0", className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        aria-label={checked ? "Deselect all" : "Select all"}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ============================================================================
// Body Components
// ============================================================================

interface ListBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ListBody({ children, className }: ListBodyProps) {
  return <div className={cn("divide-y", className)}>{children}</div>;
}

// ============================================================================
// Row Components
// ============================================================================

interface ListRowProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ListRow({
  children,
  selected = false,
  onClick,
  className,
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
      <div className="flex items-center p-4">{children}</div>
    </div>
  );
}

// ============================================================================
// Cell Components
// ============================================================================

interface ListCellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function ListCell({ children, className, width }: ListCellProps) {
  return <div className={cn(width, className)}>{children}</div>;
}

interface SelectionCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}

export function SelectionCheckbox({
  checked,
  onToggle,
  label,
  className,
}: SelectionCheckboxProps) {
  return (
    <div className={cn("w-8 flex-shrink-0", className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        aria-label={label || (checked ? "Deselect item" : "Select item")}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ============================================================================
// State Components
// ============================================================================

interface ListEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function ListEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: ListEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className
      )}
    >
      <div className="text-muted-foreground/40 mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ListLoadingStateProps {
  count?: number;
  height?: string;
  className?: string;
}

export function ListLoadingState({
  count = 6,
  height = "h-16",
  className,
}: ListLoadingStateProps) {
  return (
    <div className={cn("stack-lg", className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: acceptable for static skeleton placeholders
        <Skeleton key={`skeleton-${i}`} className={cn(height, "w-full")} />
      ))}
    </div>
  );
}
