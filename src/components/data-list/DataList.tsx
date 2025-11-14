import type React from "react";
import {
  ListBody,
  ListCell,
  ListContainer,
  ListHeader,
  ListHeaderCell,
  ListRow,
  SelectAllCheckbox,
  SelectionCheckbox,
  SortableHeader,
} from "@/components/data-list";
import type { SortDirection } from "@/hooks/use-list-sort";

export interface DataListColumn<TItem, TField extends string = string> {
  key: string;
  label: string;
  sortable?: boolean;
  sortField?: TField;
  width?: string;
  className?: string;
  hideOnMobile?: boolean;
  render: (item: TItem) => React.ReactNode;
  mobileRender?: (item: TItem) => React.ReactNode;
}

export interface DataListSelection<TItem> {
  selectedKeys: Set<string>;
  isSelected: (item: TItem) => boolean;
  isAllSelected: (items: TItem[]) => boolean;
  toggleItem: (item: TItem) => void;
  toggleAll: (items: TItem[]) => void;
}

export interface DataListSort<TField extends string> {
  field: TField | null;
  direction: SortDirection;
  onSort: (field: TField) => void;
}

interface DataListProps<TItem, TField extends string = string> {
  items: TItem[];
  getItemKey: (item: TItem) => string;
  columns: DataListColumn<TItem, TField>[];
  selection?: DataListSelection<TItem>;
  sort?: DataListSort<TField>;
  onRowClick?: (item: TItem) => void;
  sortIcons?: {
    asc: React.ComponentType<{ className?: string }>;
    desc: React.ComponentType<{ className?: string }>;
  };
  mobileTitleRender?: (item: TItem) => React.ReactNode;
}

export function DataList<TItem, TField extends string = string>({
  items,
  getItemKey,
  columns,
  selection,
  sort,
  onRowClick,
  sortIcons,
  mobileTitleRender,
}: DataListProps<TItem, TField>) {
  const hasSelection = !!selection;

  return (
    <ListContainer>
      {/* Desktop Table Header */}
      <ListHeader className="hidden lg:flex">
        {hasSelection && (
          <SelectAllCheckbox
            checked={selection.isAllSelected(items)}
            onToggle={() => selection.toggleAll(items)}
          />
        )}
        {columns.map(column => {
          if (column.sortable && sort && column.sortField) {
            return (
              <SortableHeader
                key={column.key}
                field={column.sortField}
                sortField={sort.field}
                sortDirection={sort.direction}
                onSort={sort.onSort}
                width={column.width}
                className={column.className}
                icons={sortIcons}
              >
                {column.label}
              </SortableHeader>
            );
          }

          return (
            <ListHeaderCell
              key={column.key}
              width={column.width}
              className={column.className}
            >
              {column.label}
            </ListHeaderCell>
          );
        })}
      </ListHeader>

      <ListBody>
        {items.map(item => {
          const key = getItemKey(item);
          const isSelected = selection?.isSelected(item) ?? false;

          return (
            <ListRow
              key={key}
              selected={isSelected}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
            >
              {/* Desktop Table Layout */}
              <div className="hidden lg:contents">
                {hasSelection && (
                  <SelectionCheckbox
                    checked={isSelected}
                    onToggle={() => selection.toggleItem(item)}
                    label={`Select ${key}`}
                  />
                )}
                {columns.map(column => (
                  <ListCell
                    key={column.key}
                    width={column.width}
                    className={column.className}
                  >
                    {column.render(item)}
                  </ListCell>
                ))}
              </div>

              {/* Mobile Card Layout */}
              <div className="lg:hidden flex flex-col gap-2 w-full">
                {/* Mobile Header with Selection */}
                <div className="flex items-start gap-3">
                  {hasSelection && (
                    <SelectionCheckbox
                      checked={isSelected}
                      onToggle={() => selection.toggleItem(item)}
                      label={`Select ${key}`}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {mobileTitleRender
                      ? mobileTitleRender(item)
                      : columns[0]?.render(item)}
                  </div>
                </div>

                {/* Mobile Content */}
                <div className="stack-2 ml-11">
                  {columns.slice(1).map(column => {
                    if (column.hideOnMobile) {
                      return null;
                    }

                    const content = column.mobileRender
                      ? column.mobileRender(item)
                      : column.render(item);

                    return (
                      <div key={column.key} className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground font-medium">
                          {column.label}
                        </span>
                        <div>{content}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ListRow>
          );
        })}
      </ListBody>
    </ListContainer>
  );
}
