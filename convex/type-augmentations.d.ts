import type {
  DocumentByInfo,
  GenericTableInfo,
  IndexNames,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  Query,
} from "convex/server";

declare module "convex/server" {
  interface QueryInitializer<TableInfo extends GenericTableInfo> {
    withIndex<IndexName extends IndexNames<TableInfo>>(
      indexName: IndexName,
      indexRange?: (
        q: IndexRangeBuilder<
          DocumentByInfo<TableInfo>,
          NamedIndex<TableInfo, IndexName>
        >
      ) => IndexRange
    ): Query<TableInfo>;
  }
}
