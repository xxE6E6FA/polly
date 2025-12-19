# Built-in Models

Config in `config/models/text-models.ts` and `config/models/image-models.ts`.

After changes, seed the database:

```bash
bunx convex run migrations/seedBuiltInModels:runMigration
```

Requires provider API keys in Convex env vars. Models without keys are skipped.
