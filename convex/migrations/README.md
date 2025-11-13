# Database Migrations

This directory contains database migrations for Polly.

## Migration System

All migrations are in the `convex/migrations/` directory. Each migration file exports:

- Individual mutation functions for granular control
- `runMigration` - Runs the full migration

For new migrations:

1. Create migration file in `convex/migrations/`
2. Export `runMigration` function
3. For large datasets, use pagination pattern (see `populateUserFiles.ts`)
4. If needs external calling, make it a `mutation` not `internalMutation`

## Migration Order & Dependencies

**IMPORTANT:** These migrations must be run in the following order:

1. **`addUserIdToMessages`** (Required first)
   - Adds `userId` field to all existing messages
   - **Must run before** `populateUserFiles`
   - Creates the `by_user_created` index needed by later migrations

2. **`populateUserFiles`** (Required second)
   - Populates the new `userFiles` table from message attachments
   - **Depends on** `addUserIdToMessages` having completed
   - Uses paginated batching for large datasets
   - Run via: `bun scripts/run-populate-userfiles.ts`

3. **`updateUserFilesMetadata`** (Optional enhancement)
   - Enriches existing `userFiles` entries with additional metadata
   - Can be run anytime after `populateUserFiles`
   - Safe to skip if metadata is already complete

## CLI Helper

```bash
# List available migrations
bun scripts/run-migration.ts --list

# Run specific migration (if it's internal)
bunx convex run migrations/<name>:runMigration '{}'

# For paginated migrations, use custom script
bun scripts/run-populate-userfiles.ts
```
