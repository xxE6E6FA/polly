import type React from "react";
import type { SortDirection } from "@/hooks/use-list-sort";
import type { MobileDrawerConfig } from "./DataListMobileDrawer";
import { DataListMobileRow } from "./DataListMobileRow";
import { generateGridTemplate } from "./gridUtils";
import { ListBody } from "./ListBody";
import { ListCell } from "./ListCell";
import { ListContainer } from "./ListContainer";
import { ListHeader } from "./ListHeader";
import { ListHeaderCell } from "./ListHeaderCell";
import { ListRow } from "./ListRow";
import { SelectAllCheckbox } from "./SelectAllCheckbox";
import { SelectionCheckbox } from "./SelectionCheckbox";
import { SortableHeader } from "./SortableHeader";

export interface DataListColumn<TItem, TField extends string = string> {
  key: string;
  label: string;
  sortable?: boolean;
  sortField?: TField;
  width?: string;
  className?: string;
  hideOnMobile?: boolean;
  hideLabelOnMobile?: boolean;
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
  /** Selection state - only shown on desktop, disabled on mobile */
  selection?: DataListSelection<TItem>;
  sort?: DataListSort<TField>;
  onRowClick?: (item: TItem) => void;
  sortIcons?: {
    asc: React.ComponentType<{ className?: string }>;
    desc: React.ComponentType<{ className?: string }>;
  };
  mobileTitleRender?: (item: TItem) => React.ReactNode;
  /**
   * Custom metadata renderer for mobile view.
   * When provided, replaces the default column-based mobile content rendering.
   * Use this for compact, inline metadata display (e.g., "Conversation • Date").
   */
  mobileMetadataRender?: (item: TItem) => React.ReactNode;
  /**
   * Configuration for mobile drawer actions.
   * When provided, shows a drawer with actions instead of inline buttons.
   */
  mobileDrawerConfig?: MobileDrawerConfig<TItem>;
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
  mobileMetadataRender,
  mobileDrawerConfig,
}: DataListProps<TItem, TField>) {
  const hasSelection = !!selection;

  // Generate CSS Grid template from column widths
  // This ensures headers and rows are automatically aligned
  const gridTemplate = generateGridTemplate(
    columns.map(col => col.width),
    hasSelection
  );

  return (
    <ListContainer>
      {/* Desktop Table Header */}
      <ListHeader className="hidden lg:block" gridTemplate={gridTemplate}>
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
                className={column.className}
                icons={sortIcons}
              >
                {column.label}
              </SortableHeader>
            );
          }

          return (
            <ListHeaderCell key={column.key} className={column.className}>
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
              gridTemplate={gridTemplate}
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
                  <ListCell key={column.key} className={column.className}>
                    {column.render(item)}
                  </ListCell>
                ))}
              </div>

              {/* Mobile Card Layout */}
              <DataListMobileRow
                item={item}
                columns={columns}
                mobileTitleRender={mobileTitleRender}
                mobileMetadataRender={mobileMetadataRender}
                mobileDrawerConfig={mobileDrawerConfig}
                onRowClick={onRowClick}
              />
            </ListRow>
          );
        })}
      </ListBody>
    </ListContainer>
  );
}
