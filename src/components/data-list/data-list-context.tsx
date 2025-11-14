import { createContext, useContext } from "react";
import type { SortDirection } from "@/hooks/use-list-sort";

export interface DataListContextValue<TItem, TField extends string> {
  // Selection
  selectedKeys: Set<string>;
  isSelected: (item: TItem) => boolean;
  isAllSelected: (items: TItem[]) => boolean;
  toggleItem: (item: TItem) => void;
  toggleAll: (items: TItem[]) => void;
  clearSelection: () => void;

  // Sorting
  sortField: TField | null;
  sortDirection: SortDirection;
  toggleSort: (field: TField) => void;

  // Item key extraction
  getItemKey: (item: TItem) => string;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic context requires any
const DataListContext = createContext<DataListContextValue<any, any> | null>(
  null
);

export function DataListProvider<TItem, TField extends string>({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DataListContextValue<TItem, TField>;
}) {
  return (
    <DataListContext.Provider value={value}>
      {children}
    </DataListContext.Provider>
  );
}

export function useDataListContext<
  TItem,
  TField extends string,
>(): DataListContextValue<TItem, TField> {
  const context = useContext(DataListContext);
  if (!context) {
    throw new Error(
      "DataList components must be used within a DataList provider"
    );
  }
  return context;
}
