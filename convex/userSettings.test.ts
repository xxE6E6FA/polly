import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  getUserSettingsForExportHandler,
  getUserSettingsHandler,
  togglePersonasEnabledHandler,
  updateArchiveSettingsHandler,
  updateUserSettingsForImportHandler,
  updateUserSettingsHandler,
} from "./userSettings";

describe("userSettings.getUserSettings", () => {
  test("returns user settings when authenticated", async () => {
    const userId = "user-123" as Id<"users">;

    const mockSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      personasEnabled: true,
      openRouterSorting: "default" as const,
      anonymizeForDemo: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
      ttsModelId: "eleven_v3",
      ttsStabilityMode: "creative",
      ttsUseAudioTags: true,
      ttsVoiceId: undefined,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(mockSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserSettingsHandler(ctx as QueryCtx);

    expect(result).toMatchObject({
      userId,
      personasEnabled: true,
    });
  });

  test("returns default settings when user has no settings", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserSettingsHandler(ctx as QueryCtx);

    expect(result).toEqual({
      userId,
      personasEnabled: true,
      openRouterSorting: "default",
      anonymizeForDemo: false,
      autoArchiveEnabled: false,
      autoArchiveDays: 30,
      ttsUseAudioTags: true,
      ttsStabilityMode: "creative",
      ttsVoiceId: undefined,
      ttsModelId: "eleven_v3",
      showMessageMetadata: false,
    });
  });

  test("returns null when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getUserSettingsHandler(ctx as QueryCtx);

    expect(result).toBeNull();
  });
});

describe("userSettings.updateUserSettings", () => {
  test("updates existing user settings", async () => {
    const userId = "user-123" as Id<"users">;

    const existingSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      personasEnabled: true,
      openRouterSorting: "default" as const,
      anonymizeForDemo: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
    };

    const updates = {
      personasEnabled: false,
      autoArchiveDays: 60,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(existingSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateUserSettingsHandler(ctx as MutationCtx, updates);

    expect(ctx.db.patch).toHaveBeenCalledWith(existingSettings._id, {
      ...updates,
      updatedAt: expect.any(Number),
    });
  });

  test("creates new user settings when none exist", async () => {
    const userId = "user-123" as Id<"users">;

    const updates = {
      personasEnabled: true,
      autoArchiveEnabled: false,
    };

    const newSettingsId = "settings-new" as Id<"userSettings">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        insert: mock(() => Promise.resolve(newSettingsId)),
      },
    });

    await updateUserSettingsHandler(ctx as MutationCtx, updates);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "userSettings",
      expect.objectContaining({
        userId,
        ...updates,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
    );
  });

  test("throws error when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      updateUserSettingsHandler(ctx as MutationCtx, { personasEnabled: true })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("userSettings.getUserSettingsForExport", () => {
  test("returns user settings for export when authenticated", async () => {
    const userId = "user-123" as Id<"users">;

    const mockSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      personasEnabled: true,
      openRouterSorting: "default" as const,
      anonymizeForDemo: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(mockSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserSettingsForExportHandler(ctx as QueryCtx);

    expect(result).toEqual(mockSettings);
  });

  test("returns null when user has no settings for export", async () => {
    const userId = "user-123" as Id<"users">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserSettingsForExportHandler(ctx as QueryCtx);

    expect(result).toBeNull();
  });

  test("throws error when not authenticated for export", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getUserSettingsForExportHandler(ctx as QueryCtx);

    expect(result).toBeNull();
  });
});

describe("userSettings.updateUserSettingsForImport", () => {
  test("updates existing settings during import", async () => {
    const userId = "user-123" as Id<"users">;

    const existingSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      personasEnabled: true,
      openRouterSorting: "default" as const,
    };

    const importData = {
      personasEnabled: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 45,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(existingSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateUserSettingsForImportHandler(ctx as MutationCtx, {
      settings: importData,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(existingSettings._id, {
      ...importData,
      updatedAt: expect.any(Number),
    });
  });

  test("creates new settings during import", async () => {
    const userId = "user-123" as Id<"users">;

    const importData = {
      personasEnabled: true,
      anonymizeForDemo: false,
    };

    const newSettingsId = "settings-new" as Id<"userSettings">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        insert: mock(() => Promise.resolve(newSettingsId)),
      },
    });

    await updateUserSettingsForImportHandler(ctx as MutationCtx, {
      settings: importData,
    });

    expect(ctx.db.insert).toHaveBeenCalledWith("userSettings", {
      userId,
      ...importData,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  test("throws error when not authenticated for import", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      updateUserSettingsForImportHandler(ctx as MutationCtx, {
        settings: { personasEnabled: true },
      })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("userSettings.togglePersonasEnabled", () => {
  test("sets personas enabled to specified value", async () => {
    const userId = "user-123" as Id<"users">;

    const existingSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      personasEnabled: true,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(existingSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await togglePersonasEnabledHandler(ctx as MutationCtx, { enabled: false });

    expect(ctx.db.patch).toHaveBeenCalledWith(existingSettings._id, {
      personasEnabled: false,
      updatedAt: expect.any(Number),
    });
  });

  test("creates default settings with specified personas enabled value", async () => {
    const userId = "user-123" as Id<"users">;

    const newSettingsId = "settings-new" as Id<"userSettings">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        insert: mock(() => Promise.resolve(newSettingsId)),
      },
    });

    await togglePersonasEnabledHandler(ctx as MutationCtx, { enabled: false });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "userSettings",
      expect.objectContaining({
        userId,
        personasEnabled: false,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
    );
  });

  test("throws error when not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      togglePersonasEnabledHandler(ctx as MutationCtx, { enabled: true })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("userSettings.updateArchiveSettings", () => {
  test("updates archive settings", async () => {
    const userId = "user-123" as Id<"users">;

    const existingSettings = {
      _id: "settings-1" as Id<"userSettings">,
      userId,
      autoArchiveEnabled: false,
      autoArchiveDays: 30,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(existingSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        patch: mock(() => Promise.resolve()),
      },
    });

    await updateArchiveSettingsHandler(ctx as MutationCtx, {
      autoArchiveEnabled: true,
      autoArchiveDays: 60,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(existingSettings._id, {
      autoArchiveEnabled: true,
      autoArchiveDays: 60,
      updatedAt: expect.any(Number),
    });
  });

  test("creates default settings if none exist for archive update", async () => {
    const userId = "user-123" as Id<"users">;

    const newSettingsId = "settings-new" as Id<"userSettings">;

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
        insert: mock(() => Promise.resolve(newSettingsId)),
      },
    });

    await updateArchiveSettingsHandler(ctx as MutationCtx, {
      autoArchiveEnabled: false,
      autoArchiveDays: 15,
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "userSettings",
      expect.objectContaining({
        userId,
        autoArchiveEnabled: false,
        autoArchiveDays: 15,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
    );
  });

  test("throws error when not authenticated for archive update", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      updateArchiveSettingsHandler(ctx as MutationCtx, {
        autoArchiveEnabled: true,
        autoArchiveDays: 30,
      })
    ).rejects.toThrow("User not authenticated");
  });
});
