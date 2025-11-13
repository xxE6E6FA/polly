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

## CLI Helper

```bash
# List available migrations
bun scripts/run-migration.ts --list

# Run specific migration (if it's internal)
bunx convex run migrations/<name>:runMigration '{}'

# For paginated migrations, use custom script
bun scripts/run-populate-userfiles.ts
```
