import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationOptions } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { getAuthenticatedUser } from "../shared_utils";
import { type FileTypeFilter, isNonNull } from "./helpers";

/**
 * Get all user files with metadata and usage information
 * Now using the dedicated userFiles table with proper pagination support
 */
export async function getUserFilesHandler(
  ctx: QueryCtx,
  args: {
    paginationOpts: PaginationOptions;
    fileType?: FileTypeFilter;
    includeGenerated?: boolean;
    searchQuery?: string;
    sortField?: "name" | "created";
    sortDirection?: "asc" | "desc";
  }
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    // Return empty result instead of throwing error
    // This prevents console errors when the dialog is mounted but user is not authenticated
    return {
      page: [],
      isDone: true,
      continueCursor: "",
    };
  }

  const fileType = args.fileType ?? "all";
  const includeGenerated = args.includeGenerated ?? true;
  const searchQuery = args.searchQuery?.trim();
  const sortField = args.sortField ?? "created";
  const sortDirection = args.sortDirection ?? "desc";

  // Build the query based on filters - all filtering at database level
  let query;

  // If search query is provided, use search index (sorting by relevance, not customizable)
  if (searchQuery) {
    query = ctx.db
      .query("userFiles")
      .withSearchIndex("search_name", q =>
        q.search("name", searchQuery).eq("userId", userId)
      );

    // Apply type filter if specified
    if (fileType !== "all") {
      query = query.filter(q => q.eq(q.field("type"), fileType));
    }

    // Apply isGenerated filter based on fileType and includeGenerated
    if (fileType === "image" && !includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    } else if (fileType === "all" && !includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    }
  } else if (sortField === "name") {
    // Sort by name - use by_user_name index
    // Note: type filtering with name sorting requires post-filter
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_name", q => q.eq("userId", userId))
      .order(sortDirection);

    // Apply type filter if specified
    if (fileType !== "all") {
      query = query.filter(q => q.eq(q.field("type"), fileType));
    }

    // Apply isGenerated filter
    if (!includeGenerated) {
      query = query.filter(q => q.eq(q.field("isGenerated"), false));
    }
  } else if (fileType === "image" && !includeGenerated) {
    // Special case: images only, exclude generated
    // Use by_user_type_created for images and filter before ordering
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", "image")
      )
      .filter(q => q.eq(q.field("isGenerated"), false))
      .order(sortDirection);
  } else if (
    fileType === "pdf" ||
    fileType === "text" ||
    fileType === "audio" ||
    fileType === "video"
  ) {
    // PDF, text, audio, or video files (these are never generated, so includeGenerated doesn't matter)
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", fileType)
      )
      .order(sortDirection);
  } else if (fileType === "image" && includeGenerated) {
    // All images including generated
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_type_created", q =>
        q.eq("userId", userId).eq("type", "image")
      )
      .order(sortDirection);
  } else if (fileType === "all" && includeGenerated) {
    // All files including generated
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_created", q => q.eq("userId", userId))
      .order(sortDirection);
  } else {
    // fileType === "all" && !includeGenerated
    // All files excluding generated images
    query = ctx.db
      .query("userFiles")
      .withIndex("by_user_generated", q =>
        q.eq("userId", userId).eq("isGenerated", false)
      )
      .order(sortDirection);
  }

  // Apply pagination - no post-pagination filtering needed
  const paginatedResult = await query.paginate(args.paginationOpts);

  // Fetch conversation titles and file URLs
  // Note: We build attachment data from userFiles table directly to avoid
  // expensive message lookups (messages can be large with many attachments)
  const filesWithMetadata = await Promise.all(
    paginatedResult.page.map(async file => {
      try {
        const [conversation, fileMetadata, fileUrl] = await Promise.all([
          ctx.db.get("conversations", file.conversationId),
          ctx.db.system.get(file.storageId),
          ctx.storage.getUrl(file.storageId),
        ]);

        // Skip files where storage file no longer exists (was deleted)
        // This prevents broken image links in the file library
        if (!fileUrl) {
          return null;
        }

        // Build attachment from userFiles data (no message fetch needed)
        const attachment = {
          type: file.type,
          name: file.name,
          size: file.size,
          url: fileUrl,
          storageId: file.storageId,
          mimeType: file.mimeType,
          thumbnail: file.thumbnail,
          generatedImage: file.isGenerated
            ? {
                isGenerated: true,
                source: file.generatedImageSource || "unknown",
                model: file.generatedImageModel,
              }
            : undefined,
        };

        return {
          storageId: file.storageId,
          attachment,
          messageId: file.messageId,
          conversationId: file.conversationId,
          conversationName: conversation?.title ?? "Untitled conversation",
          createdAt: file.createdAt,
          url: fileUrl,
          metadata: fileMetadata,
        };
      } catch (error) {
        console.error(
          `Failed to get metadata for file ${file.storageId}:`,
          error
        );
        return null;
      }
    })
  );

  const files = filesWithMetadata.filter(isNonNull);

  // Deduplicate by storageId - files can appear multiple times when conversations are cloned
  // Keep the first occurrence (most recent due to sorting) for each unique storageId
  const seenStorageIds = new Set<Id<"_storage">>();
  const deduplicatedFiles = files.filter(file => {
    if (seenStorageIds.has(file.storageId)) {
      return false;
    }
    seenStorageIds.add(file.storageId);
    return true;
  });

  return {
    page: deduplicatedFiles,
    isDone: paginatedResult.isDone,
    continueCursor: paginatedResult.continueCursor,
  };
}

/**
 * Get file usage statistics for a user
 * Now using the dedicated userFiles table for efficient querying
 */
export async function getUserFileStatsHandler(ctx: QueryCtx) {
  const userId = await getAuthenticatedUser(ctx);

  // Get all user files efficiently using the index
  const userFiles = await ctx.db
    .query("userFiles")
    .withIndex("by_user_created", q => q.eq("userId", userId))
    .collect();

  let totalFiles = 0;
  let totalSize = 0;
  const typeCounts: Record<string, number> = {
    image: 0,
    pdf: 0,
    text: 0,
    audio: 0,
    video: 0,
  };
  const generatedImageCount = { count: 0, size: 0 };

  for (const file of userFiles) {
    totalFiles++;
    totalSize += file.size;

    if (file.type === "image" && file.isGenerated) {
      generatedImageCount.count++;
      generatedImageCount.size += file.size;
    } else {
      typeCounts[file.type] = (typeCounts[file.type] ?? 0) + 1;
    }
  }

  return {
    totalFiles,
    totalSize,
    typeCounts,
    generatedImages: generatedImageCount,
  };
}
