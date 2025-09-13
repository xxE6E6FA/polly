// Convex test harness setup
// Follows https://docs.convex.dev/testing/convex-test
import { convexTest } from "convex-test";
import schema from "../schema";

// Import all Convex functions manually
import * as messages from "../messages";
import * as conversations from "../conversations";
import * as users from "../users";
import * as userModels from "../userModels";
import * as auth from "../auth";
import * as backgroundJobs from "../backgroundJobs";
import * as chat from "../chat";
import * as cleanup from "../cleanup";
import * as conversationExport from "../conversationExport";
import * as conversationImport from "../conversationImport";
import * as conversationStarters from "../conversationStarters";
import * as conversationSummary from "../conversationSummary";
import * as crons from "../crons";
import * as fileStorage from "../fileStorage";
import * as http from "../http";
import * as imageModels from "../imageModels";
import * as internal from "../internal";
import * as models from "../models";
import * as personas from "../personas";
import * as runMigration from "../runMigration";
import * as sharedConversations from "../sharedConversations";
import * as titleGeneration from "../titleGeneration";
import * as userSettings from "../userSettings";
import * as branches from "../branches";

// Import generated files
import * as api from "../_generated/api";
import * as server from "../_generated/server";

const modules = {
  "messages": () => Promise.resolve(messages),
  "conversations": () => Promise.resolve(conversations),
  "users": () => Promise.resolve(users),
  "userModels": () => Promise.resolve(userModels),
  "auth": () => Promise.resolve(auth),
  "backgroundJobs": () => Promise.resolve(backgroundJobs),
  "chat": () => Promise.resolve(chat),
  "cleanup": () => Promise.resolve(cleanup),
  "conversationExport": () => Promise.resolve(conversationExport),
  "conversationImport": () => Promise.resolve(conversationImport),
  "conversationStarters": () => Promise.resolve(conversationStarters),
  "conversationSummary": () => Promise.resolve(conversationSummary),
  "crons": () => Promise.resolve(crons),
  "fileStorage": () => Promise.resolve(fileStorage),
  "http": () => Promise.resolve(http),
  "imageModels": () => Promise.resolve(imageModels),
  "internal": () => Promise.resolve(internal),
  "models": () => Promise.resolve(models),
  "personas": () => Promise.resolve(personas),
  "runMigration": () => Promise.resolve(runMigration),
  "sharedConversations": () => Promise.resolve(sharedConversations),
  "titleGeneration": () => Promise.resolve(titleGeneration),
  "userSettings": () => Promise.resolve(userSettings),
  "branches": () => Promise.resolve(branches),
  // Generated files
  "_generated/api": () => Promise.resolve(api),
  "_generated/server": () => Promise.resolve(server),
};

export async function makeConvexTest() {
  const base = convexTest(schema, modules);

  // Helper to augment an auth-enabled handle with runQuery/runMutation
  const augment = (h: any) =>
    Object.assign({}, h, {
      runQuery: (fn: any, args?: any) => h.query(fn, args),
      runMutation: (fn: any, args?: any) => h.mutation(fn, args),
    });

  // Back-compat helpers: expose a minimal `.db` that proxies through t.run(ctx => ctx.db...)
  // Many tests use t.db.insert/patch/get directly.
  const db = {
    insert: (table: string, value: any) =>
      table === "_storage"
        ? ((`${Date.now()};_storage`) as any)
        : base.run((ctx: any) => ctx.db.insert(table as any, value)),
    patch: (id: any, value: any) => base.run((ctx: any) => ctx.db.patch(id, value)),
    delete: (id: any) => base.run((ctx: any) => ctx.db.delete(id)),
    get: (id: any) => base.run((ctx: any) => ctx.db.get(id)),
  } as const;

  // Wrap withIdentity to augment returned handle
  const withIdentity = (identity: any) => augment((base.withIdentity as any)(identity));

  // Return augmented root handle
  return Object.assign({}, augment(base), { db }, { withIdentity });
}
