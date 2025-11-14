import { CheckIcon } from "@phosphor-icons/react";
import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortDirection } from "@/hooks/use-list-sort";
import { cn } from "@/lib/utils";
import { DataListProvider, useDataListContext } from "./data-list-context";

// ============================================================================
// Root DataList Component
// ============================================================================

export interface DataListProps<TItem, TField extends string> {
  children: React.ReactNode;
  selectedKeys: Set<string>;
  isSelected: (item: TItem) => boolean;
  isAllSelected: (items: TItem[]) => boolean;
  toggleItem: (item: TItem) => void;
  toggleAll: (items: TItem[]) => void;
  clearSelection: () => void;
  sortField: TField | null;
  sortDirection: SortDirection;
  toggleSort: (field: TField) => void;
  getItemKey: (item: TItem) => string;
}

export function DataListRoot<TItem, TField extends string>({
  children,
  selectedKeys,
  isSelected,
  isAllSelected,
  toggleItem,
  toggleAll,
  clearSelection,
  sortField,
  sortDirection,
  toggleSort,
  getItemKey,
}: DataListProps<TItem, TField>) {
  return (
    <DataListProvider
      value={{
        selectedKeys,
        isSelected,
        isAllSelected,
        toggleItem,
        toggleAll,
        clearSelection,
        sortField,
        sortDirection,
        toggleSort,
        getItemKey,
      }}
    >
      {children}
    </DataListProvider>
  );
}

// ============================================================================
// Container Component
// ============================================================================

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {children}
    </div>
  );
}

// ============================================================================
// Header Component
// ============================================================================

interface HeaderProps {
  children: React.ReactNode;
  className?: string;
}

function Header({ children, className }: HeaderProps) {
  return (
    <div className={cn("bg-muted/50 border-b", className)}>
      <div className="flex items-center p-4">{children}</div>
    </div>
  );
}

// ============================================================================
// Header Cell Components
// ============================================================================

interface HeaderCellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

function HeaderCell({ children, className, width }: HeaderCellProps) {
  return (
    <div className={cn("text-sm font-medium", width, className)}>
      {children}
    </div>
  );
}

interface SortableHeaderCellProps<TField extends string> {
  field: TField;
  children: React.ReactNode;
  className?: string;
  width?: string;
  SortIcons?: {
    Asc: React.ComponentType<{ className?: string }>;
    Desc: React.ComponentType<{ className?: string }>;
  };
}

function SortableHeaderCell<TField extends string>({
  field,
  children,
  className,
  width,
  SortIcons,
}: SortableHeaderCellProps<TField>) {
  const { sortField, sortDirection, toggleSort } = useDataListContext<
    // biome-ignore lint/suspicious/noExplicitAny: Generic field type requires any
    any,
    TField
  >();

  const isActive = sortField === field;
  const AscIcon = SortIcons?.Asc;
  const DescIcon = SortIcons?.Desc;

  return (
    <div className={cn(width, className)}>
      <button
        onClick={() => toggleSort(field)}
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

interface SelectAllCellProps<TItem> {
  items: TItem[];
  className?: string;
}

function SelectAllCell<TItem>({ items, className }: SelectAllCellProps<TItem>) {
  const { isAllSelected, toggleAll } = useDataListContext<TItem, string>();
  const allSelected = isAllSelected(items);

  return (
    <div className={cn("w-8 flex-shrink-0", className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          toggleAll(items);
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        aria-label={allSelected ? "Deselect all" : "Select all"}
      >
        {allSelected && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ============================================================================
// Body Component
// ============================================================================

interface BodyProps {
  children: React.ReactNode;
  className?: string;
}

function Body({ children, className }: BodyProps) {
  return <div className={cn("divide-y", className)}>{children}</div>;
}

// ============================================================================
// Row Component
// ============================================================================

interface RowProps<TItem> {
  item: TItem;
  children: React.ReactNode;
  className?: string;
  onClick?: (item: TItem) => void;
}

function Row<TItem>({ item, children, className, onClick }: RowProps<TItem>) {
  const { isSelected } = useDataListContext<TItem, string>();
  const selected = isSelected(item);

  const handleClick = onClick ? () => onClick(item) : undefined;

  return (
    <div
      className={cn(
        "group transition-all hover:bg-muted/30",
        selected && "bg-primary/5",
        onClick && "cursor-pointer",
        className
      )}
      onClick={handleClick}
      onKeyDown={
        handleClick
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
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

interface CellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

function Cell({ children, className, width }: CellProps) {
  return <div className={cn(width, className)}>{children}</div>;
}

interface SelectCellProps<TItem> {
  item: TItem;
  className?: string;
}

function SelectCell<TItem>({ item, className }: SelectCellProps<TItem>) {
  const { isSelected, toggleItem, getItemKey } = useDataListContext<
    TItem,
    string
  >();
  const selected = isSelected(item);
  const key = getItemKey(item);

  return (
    <div className={cn("w-8 flex-shrink-0", className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          toggleItem(item);
        }}
        className="flex h-4 w-4 items-center justify-center rounded border"
        type="button"
        aria-label={selected ? `Deselect item ${key}` : `Select item ${key}`}
      >
        {selected && <CheckIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

function EmptyState({ icon, title, description, className }: EmptyStateProps) {
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
    </div>
  );
}

// ============================================================================
// Loading State Component
// ============================================================================

interface LoadingStateProps {
  count?: number;
  height?: string;
  className?: string;
}

function LoadingState({
  count = 6,
  height = "h-16",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("stack-lg", className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: acceptable for static skeleton placeholders
        <Skeleton key={`skeleton-${i}`} className={cn(height, "w-full")} />
      ))}
    </div>
  );
}

// ============================================================================
// Compound Component Export
// ============================================================================

export const DataList = Object.assign(DataListRoot, {
  Container,
  Header,
  HeaderCell,
  SortableHeaderCell,
  SelectAllCell,
  Body,
  Row,
  Cell,
  SelectCell,
  EmptyState,
  LoadingState,
});
