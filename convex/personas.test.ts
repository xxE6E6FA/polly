import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeConvexCtx, makeUnauthenticatedCtx } from "../test/convex-ctx";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  createHandler,
  getHandler,
  getUserPersonaSettingsHandler,
  importPersonasHandler,
  improvePromptHandler,
  listAllBuiltInForSettingsHandler,
  listAllBuiltInHandler,
  listAllForSettingsHandler,
  listForExportHandler,
  listForSettingsPaginatedHandler,
  listHandler,
  removeHandler,
  suggestSamplingHandler,
  toggleBuiltInPersonaHandler,
  togglePersonaHandler,
  updateHandler,
} from "./personas";

describe("personas.list", () => {
  test("returns only built-in personas for anonymous users", async () => {
    const mockBuiltInPersonas = [
      {
        _id: "persona-1" as Id<"personas">,
        isBuiltIn: true,
        isActive: true,
        name: "Assistant",
        description: "Test",
        prompt: "Test",
        order: 0,
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      filter: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve(mockBuiltInPersonas)),
    };

    const ctx = makeUnauthenticatedCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {});
    expect(result).toEqual(mockBuiltInPersonas);
  });

  test("returns built-in and user personas for authenticated users", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltInPersonas = [
      {
        _id: "persona-1" as Id<"personas">,
        isBuiltIn: true,
        isActive: true,
        name: "Assistant",
        order: 0,
      },
    ];

    const mockUserPersonas = [
      {
        _id: "persona-2" as Id<"personas">,
        userId,
        isBuiltIn: false,
        isActive: true,
        name: "Custom",
        order: 1,
      },
    ];

    const mockUserSettings: Doc<"userPersonaSettings">[] = [];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      filter: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock((limit: number) => {
        if (limit === 50) {
          return Promise.resolve(mockBuiltInPersonas);
        }
        if (limit === 100) {
          return Promise.resolve(mockUserPersonas);
        }
        return Promise.resolve(mockUserSettings);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {});
    expect(result.length).toBe(2);
    expect(result[0]._id).toBe("persona-1" as Id<"personas">);
    expect(result[1]._id).toBe("persona-2" as Id<"personas">);
  });

  test("filters out disabled built-in personas for authenticated users", async () => {
    const userId = "user-123" as Id<"users">;
    const disabledPersonaId = "persona-1" as Id<"personas">;

    const mockBuiltInPersonas = [
      {
        _id: disabledPersonaId,
        isBuiltIn: true,
        isActive: true,
        name: "Assistant",
      },
    ];

    const mockUserPersonas: Doc<"personas">[] = [];

    const mockUserSettings = [
      {
        _id: "setting-1" as Id<"userPersonaSettings">,
        userId,
        personaId: disabledPersonaId,
        isDisabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      filter: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock((limit: number) => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(mockBuiltInPersonas);
        }
        if (queryCallCount === 2) {
          return Promise.resolve(mockUserPersonas);
        }
        if (queryCallCount === 3) {
          return Promise.resolve(mockUserSettings);
        }
        return Promise.resolve([]);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {});
    expect(result.length).toBe(0);
  });

  test("sorts personas by order field", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltInPersonas = [
      {
        _id: "persona-2" as Id<"personas">,
        isBuiltIn: true,
        isActive: true,
        name: "Second",
        order: 1,
      },
      {
        _id: "persona-1" as Id<"personas">,
        isBuiltIn: true,
        isActive: true,
        name: "First",
        order: 0,
      },
    ];

    const mockUserPersonas: Doc<"personas">[] = [];
    const mockUserSettings: Doc<"userPersonaSettings">[] = [];

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      filter: mock(function () {
        return this;
      }),
      order: mock(function () {
        return this;
      }),
      take: mock((limit: number) => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(mockBuiltInPersonas);
        }
        if (queryCallCount === 2) {
          return Promise.resolve(mockUserPersonas);
        }
        if (queryCallCount === 3) {
          return Promise.resolve(mockUserSettings);
        }
        return Promise.resolve([]);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listHandler(ctx as QueryCtx, {});
    expect(result[0].name).toBe("First");
    expect(result[1].name).toBe("Second");
  });
});

describe("personas.get", () => {
  test("returns persona by id", async () => {
    const personaId = "persona-1" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      name: "Test Persona",
      description: "Test",
      prompt: "Test",
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock((_table: string, id: Id<"personas">) => {
          if (id === personaId) {
            return Promise.resolve(mockPersona);
          }
          return Promise.resolve(null);
        }),
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: personaId });
    expect(result).toEqual(mockPersona);
  });

  test("returns null for non-existent persona", async () => {
    const personaId = "persona-999" as Id<"personas">;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    const result = await getHandler(ctx as QueryCtx, { id: personaId });
    expect(result).toBeNull();
  });
});

describe("personas.create", () => {
  test("creates persona with required fields", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        insert: mock((table: string, data: any) => {
          expect(table).toBe("personas");
          expect(data.userId).toBe(userId);
          expect(data.name).toBe("Test Persona");
          expect(data.description).toBe("Test Description");
          expect(data.prompt).toBe("Test Prompt");
          expect(data.isBuiltIn).toBe(false);
          expect(data.isActive).toBe(true);
          expect(data.createdAt).toBeGreaterThan(0);
          expect(data.updatedAt).toBeGreaterThan(0);
          return Promise.resolve(personaId);
        }),
      },
    });

    const result = await createHandler(ctx as MutationCtx, {
      name: "Test Persona",
      description: "Test Description",
      prompt: "Test Prompt",
    });

    expect(result).toBe(personaId);
  });

  test("creates persona with optional fields", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        insert: mock((table: string, data: any) => {
          expect(data.icon).toBe("🤖");
          expect(data.ttsVoiceId).toBe("voice-1");
          expect(data.temperature).toBe(0.8);
          expect(data.topP).toBe(0.95);
          expect(data.advancedSamplingEnabled).toBe(true);
          return Promise.resolve(personaId);
        }),
      },
    });

    const result = await createHandler(ctx as MutationCtx, {
      name: "Test",
      description: "Test",
      prompt: "Test",
      icon: "🤖",
      ttsVoiceId: "voice-1",
      temperature: 0.8,
      topP: 0.95,
      advancedSamplingEnabled: true,
    });

    expect(result).toBe(personaId);
  });

  test("throws error for unauthenticated user", async () => {
    const ctx = makeUnauthenticatedCtx();

    await expect(
      createHandler(ctx as MutationCtx, {
        name: "Test",
        description: "Test",
        prompt: "Test",
      })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("personas.update", () => {
  test("updates persona fields", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId,
      name: "Old Name",
      description: "Old Description",
      prompt: "Old Prompt",
      isBuiltIn: false,
      isActive: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        patch: mock((_table: string, id: Id<"personas">, data: any) => {
          expect(id).toBe(personaId);
          expect(data.name).toBe("New Name");
          expect(data.description).toBe("New Description");
          expect(data.updatedAt).toBeGreaterThan(0);
          return Promise.resolve(undefined);
        }),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: personaId,
      name: "New Name",
      description: "New Description",
    });
  });

  test("throws error when updating non-owned persona", async () => {
    const userId = "user-123" as Id<"users">;
    const otherUserId = "user-456" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId: otherUserId,
      name: "Test",
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
      },
    });

    await expect(
      updateHandler(ctx as MutationCtx, {
        id: personaId,
        name: "New Name",
      })
    ).rejects.toThrow("Not authorized to modify this persona");
  });

  test("throws error when persona not found", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-999" as Id<"personas">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      updateHandler(ctx as MutationCtx, {
        id: personaId,
        name: "New Name",
      })
    ).rejects.toThrow("Persona not found");
  });

  test("throws error for unauthenticated user", async () => {
    const personaId = "persona-123" as Id<"personas">;
    const ctx = makeUnauthenticatedCtx();

    await expect(
      updateHandler(ctx as MutationCtx, {
        id: personaId,
        name: "New Name",
      })
    ).rejects.toThrow("User not authenticated");
  });

  test("updates advanced sampling parameters", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId,
      name: "Test",
      isBuiltIn: false,
      isActive: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        patch: mock((_table: string, _id: Id<"personas">, data: any) => {
          expect(data.temperature).toBe(0.9);
          expect(data.topP).toBe(0.95);
          expect(data.topK).toBe(40);
          expect(data.frequencyPenalty).toBe(0.5);
          expect(data.presencePenalty).toBe(0.3);
          expect(data.repetitionPenalty).toBe(1.1);
          expect(data.advancedSamplingEnabled).toBe(true);
          return Promise.resolve(undefined);
        }),
      },
    });

    await updateHandler(ctx as MutationCtx, {
      id: personaId,
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      repetitionPenalty: 1.1,
      advancedSamplingEnabled: true,
    });
  });
});

describe("personas.remove", () => {
  test("deletes persona", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId,
      name: "Test",
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        delete: mock((_table: string, id: Id<"personas">) => {
          expect(id).toBe(personaId);
          return Promise.resolve(undefined);
        }),
      },
    });

    await removeHandler(ctx as MutationCtx, { id: personaId });
  });

  test("throws error when deleting non-owned persona", async () => {
    const userId = "user-123" as Id<"users">;
    const otherUserId = "user-456" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId: otherUserId,
      name: "Test",
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
      },
    });

    await expect(
      removeHandler(ctx as MutationCtx, { id: personaId })
    ).rejects.toThrow("Not authorized to modify this persona");
  });

  test("throws error for unauthenticated user", async () => {
    const personaId = "persona-123" as Id<"personas">;
    const ctx = makeUnauthenticatedCtx();

    await expect(
      removeHandler(ctx as MutationCtx, { id: personaId })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("personas.togglePersona", () => {
  test("activates inactive persona", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId,
      name: "Test",
      isActive: false,
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        patch: mock((_table: string, id: Id<"personas">, data: any) => {
          expect(id).toBe(personaId);
          expect(data.isActive).toBe(true);
          expect(data.updatedAt).toBeGreaterThan(0);
          return Promise.resolve(undefined);
        }),
      },
    });

    await togglePersonaHandler(ctx as MutationCtx, {
      id: personaId,
      isActive: true,
    });
  });

  test("deactivates active persona", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId,
      name: "Test",
      isActive: true,
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        patch: mock((_table: string, _id: Id<"personas">, data: any) => {
          expect(data.isActive).toBe(false);
          return Promise.resolve(undefined);
        }),
      },
    });

    await togglePersonaHandler(ctx as MutationCtx, {
      id: personaId,
      isActive: false,
    });
  });

  test("throws error for non-owned persona", async () => {
    const userId = "user-123" as Id<"users">;
    const otherUserId = "user-456" as Id<"users">;
    const personaId = "persona-123" as Id<"personas">;
    const mockPersona = {
      _id: personaId,
      userId: otherUserId,
      name: "Test",
      isBuiltIn: false,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
      },
    });

    await expect(
      togglePersonaHandler(ctx as MutationCtx, {
        id: personaId,
        isActive: true,
      })
    ).rejects.toThrow("Not authorized to modify this persona");
  });

  test("throws error for unauthenticated user", async () => {
    const personaId = "persona-123" as Id<"personas">;
    const ctx = makeUnauthenticatedCtx();

    await expect(
      togglePersonaHandler(ctx as MutationCtx, {
        id: personaId,
        isActive: true,
      })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("personas.listForExport", () => {
  test("returns user personas for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;
    const mockPersonas = [
      {
        _id: "persona-1" as Id<"personas">,
        userId,
        name: "Persona 1",
        isActive: true,
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      take: mock(() => Promise.resolve(mockPersonas)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listForExportHandler(ctx as QueryCtx, {});
    expect(result).toEqual(mockPersonas);
  });

  test("returns empty array for anonymous user", async () => {
    const ctx = makeUnauthenticatedCtx();

    const result = await listForExportHandler(ctx as QueryCtx, {});
    expect(result).toEqual([]);
  });
});

describe("personas.importPersonas", () => {
  test("imports multiple personas", async () => {
    const userId = "user-123" as Id<"users">;
    const personaIds = ["persona-1", "persona-2"] as Id<"personas">[];

    let insertCount = 0;
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        insert: mock((table: string, data: any) => {
          expect(table).toBe("personas");
          expect(data.userId).toBe(userId);
          expect(data.isBuiltIn).toBe(false);
          expect(data.isActive).toBe(true);
          return Promise.resolve(personaIds[insertCount++]);
        }),
      },
    });

    const result = await importPersonasHandler(ctx as MutationCtx, {
      personas: [
        {
          name: "Persona 1",
          description: "Description 1",
          prompt: "Prompt 1",
        },
        {
          name: "Persona 2",
          description: "Description 2",
          prompt: "Prompt 2",
        },
      ],
    });

    expect(result).toEqual(personaIds);
    expect(insertCount).toBe(2);
  });

  test("imports persona with optional icon", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-1" as Id<"personas">;

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        insert: mock((table: string, data: any) => {
          expect(data.icon).toBe("🤖");
          return Promise.resolve(personaId);
        }),
      },
    });

    const result = await importPersonasHandler(ctx as MutationCtx, {
      personas: [
        {
          name: "Test",
          description: "Test",
          prompt: "Test",
          icon: "🤖",
        },
      ],
    });

    expect(result).toEqual([personaId]);
  });

  test("throws error for unauthenticated user", async () => {
    const ctx = makeUnauthenticatedCtx();

    await expect(
      importPersonasHandler(ctx as MutationCtx, {
        personas: [
          {
            name: "Test",
            description: "Test",
            prompt: "Test",
          },
        ],
      })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("personas.suggestSampling", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = undefined;
  });

  test("returns suggested sampling parameters", async () => {
    global.fetch = mock((url: string, options?: RequestInit) => {
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).toContain("test-key");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"temperature": 0.8, "topP": 0.95}' }],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await suggestSamplingHandler({} as ActionCtx, {
      systemPrompt: "You are a helpful assistant",
    });

    expect(result.temperature).toBe(0.8);
    expect(result.topP).toBe(0.95);
  });

  test("handles JSON with code fences", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: '```json\n{"temperature": 0.7}\n```' }],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await suggestSamplingHandler({} as ActionCtx, {
      systemPrompt: "Test",
    });

    expect(result.temperature).toBe(0.7);
  });

  test("throws error when API key not configured", async () => {
    process.env.GEMINI_API_KEY = undefined;

    await expect(
      suggestSamplingHandler({} as ActionCtx, {
        systemPrompt: "Test",
      })
    ).rejects.toThrow("Gemini API key not configured");
  });

  test("throws error on API failure", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
      } as Response);
    });

    await expect(
      suggestSamplingHandler({} as ActionCtx, {
        systemPrompt: "Test",
      })
    ).rejects.toThrow("Gemini API error: 500");
  });

  test("returns empty object on invalid JSON", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: "invalid json" }],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await suggestSamplingHandler({} as ActionCtx, {
      systemPrompt: "Test",
    });

    expect(result).toEqual({});
  });

  test("extracts JSON from mixed text", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Some text before {"temperature": 0.6} some text after',
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await suggestSamplingHandler({} as ActionCtx, {
      systemPrompt: "Test",
    });

    expect(result.temperature).toBe(0.6);
  });

  test("handles all sampling parameters", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        temperature: 0.9,
                        topP: 0.95,
                        topK: 40,
                        frequencyPenalty: 0.5,
                        presencePenalty: 0.3,
                        repetitionPenalty: 1.1,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await suggestSamplingHandler({} as ActionCtx, {
      systemPrompt: "Test",
    });

    expect(result.temperature).toBe(0.9);
    expect(result.topP).toBe(0.95);
    expect(result.topK).toBe(40);
    expect(result.frequencyPenalty).toBe(0.5);
    expect(result.presencePenalty).toBe(0.3);
    expect(result.repetitionPenalty).toBe(1.1);
  });
});

describe("personas.listAllBuiltIn", () => {
  test("returns all active built-in personas", async () => {
    const mockBuiltInPersonas = [
      {
        _id: "persona-1" as Id<"personas">,
        name: "Assistant",
        isBuiltIn: true,
        isActive: true,
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      filter: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInPersonas)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listAllBuiltInHandler(ctx as QueryCtx, {});
    expect(result).toEqual(mockBuiltInPersonas);
  });
});

describe("personas.getUserPersonaSettings", () => {
  test("returns user persona settings for authenticated user", async () => {
    const userId = "user-123" as Id<"users">;
    const mockSettings = [
      {
        _id: "setting-1" as Id<"userPersonaSettings">,
        userId,
        personaId: "persona-1" as Id<"personas">,
        isDisabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockSettings)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await getUserPersonaSettingsHandler(ctx as QueryCtx, {});
    expect(result).toEqual(mockSettings);
  });

  test("returns empty array for anonymous user", async () => {
    const ctx = makeUnauthenticatedCtx();

    const result = await getUserPersonaSettingsHandler(ctx as QueryCtx, {});
    expect(result).toEqual([]);
  });
});

describe("personas.listAllForSettings", () => {
  test("returns all user personas sorted by creation time", async () => {
    const userId = "user-123" as Id<"users">;
    const mockActive = [
      {
        _id: "persona-2" as Id<"personas">,
        userId,
        name: "Second",
        isActive: true,
        _creationTime: 200,
      },
    ];
    const mockInactive = [
      {
        _id: "persona-1" as Id<"personas">,
        userId,
        name: "First",
        isActive: false,
        _creationTime: 100,
      },
    ];

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(mockActive);
        }
        if (queryCallCount === 2) {
          return Promise.resolve(mockInactive);
        }
        return Promise.resolve([]);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listAllForSettingsHandler(ctx as QueryCtx, {});
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("First");
    expect(result[1].name).toBe("Second");
  });

  test("returns empty array for anonymous user", async () => {
    const ctx = makeUnauthenticatedCtx();

    const result = await listAllForSettingsHandler(ctx as QueryCtx, {});
    expect(result).toEqual([]);
  });
});

describe("personas.listAllBuiltInForSettings", () => {
  test("returns all built-in personas regardless of active status", async () => {
    const mockBuiltInPersonas = [
      {
        _id: "persona-1" as Id<"personas">,
        name: "Active",
        isBuiltIn: true,
        isActive: true,
      },
      {
        _id: "persona-2" as Id<"personas">,
        name: "Inactive",
        isBuiltIn: true,
        isActive: false,
      },
    ];

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => Promise.resolve(mockBuiltInPersonas)),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listAllBuiltInForSettingsHandler(ctx as QueryCtx, {});
    expect(result).toEqual(mockBuiltInPersonas);
  });
});

describe("personas.listForSettingsPaginated", () => {
  test("returns paginated personas sorted by type", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltIn = [
      {
        _id: "persona-1" as Id<"personas">,
        name: "Built-in",
        description: "Test",
        prompt: "Test",
        isBuiltIn: true,
        isActive: true,
        _creationTime: 100,
      },
    ];

    const mockUser = [
      {
        _id: "persona-2" as Id<"personas">,
        userId,
        name: "Custom",
        description: "Test",
        prompt: "Test",
        isBuiltIn: false,
        isActive: true,
        _creationTime: 200,
      },
    ];

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(mockBuiltIn);
        }
        if (queryCallCount === 2) {
          return Promise.resolve(mockUser); // active user personas
        }
        if (queryCallCount === 3) {
          return Promise.resolve([]); // inactive user personas
        }
        if (queryCallCount === 4) {
          return Promise.resolve([]); // user settings
        }
        return Promise.resolve([]);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listForSettingsPaginatedHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page.length).toBe(2);
    expect(result.page[0].type).toBe("built-in");
    expect(result.page[1].type).toBe("custom");
    expect(result.isDone).toBe(true);
  });

  test("sorts by name when sortField is name", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltIn = [
      {
        _id: "persona-1" as Id<"personas">,
        name: "Zebra",
        description: "Test",
        prompt: "Test",
        isBuiltIn: true,
        isActive: true,
        _creationTime: 100,
      },
      {
        _id: "persona-2" as Id<"personas">,
        name: "Apple",
        description: "Test",
        prompt: "Test",
        isBuiltIn: true,
        isActive: true,
        _creationTime: 200,
      },
    ];

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(mockBuiltIn);
        }
        return Promise.resolve([]);
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const result = await listForSettingsPaginatedHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10, cursor: null },
      sortField: "name",
      sortDirection: "asc",
    });

    expect(result.page[0].name).toBe("Apple");
    expect(result.page[1].name).toBe("Zebra");
  });

  test("returns empty result for anonymous user", async () => {
    const ctx = makeUnauthenticatedCtx();

    const result = await listForSettingsPaginatedHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test("handles pagination with cursor", async () => {
    const userId = "user-123" as Id<"users">;

    const mockBuiltInPersonas = Array.from({ length: 15 }, (_, i) => ({
      _id: `persona-${i}` as Id<"personas">,
      name: `Persona ${i}`,
      description: "Test",
      prompt: "Test",
      isBuiltIn: true,
      isActive: true,
      _creationTime: i,
    }));

    let queryCallCount = 0;
    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      collect: mock(() => {
        queryCallCount++;
        if (queryCallCount === 1 || queryCallCount === 5) {
          return Promise.resolve(mockBuiltInPersonas); // built-in personas
        }
        return Promise.resolve([]); // active, inactive user personas, settings
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => mockQuery),
      },
    });

    const firstPage = await listForSettingsPaginatedHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(firstPage.page.length).toBe(10);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toBe("10");

    const secondPage = await listForSettingsPaginatedHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 10, cursor: "10" },
    });

    expect(secondPage.page.length).toBe(5);
    expect(secondPage.isDone).toBe(true);
    expect(secondPage.continueCursor).toBeNull();
  });
});

describe("personas.toggleBuiltInPersona", () => {
  test("creates setting when toggling built-in persona for first time", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-1" as Id<"personas">;
    const settingId = "setting-1" as Id<"userPersonaSettings">;

    const mockPersona = {
      _id: personaId,
      name: "Assistant",
      isBuiltIn: true,
      isActive: true,
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(null)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        query: mock(() => mockQuery),
        insert: mock((table: string, data: any) => {
          expect(table).toBe("userPersonaSettings");
          expect(data.userId).toBe(userId);
          expect(data.personaId).toBe(personaId);
          expect(data.isDisabled).toBe(true);
          return Promise.resolve(settingId);
        }),
      },
    });

    const result = await toggleBuiltInPersonaHandler(ctx as MutationCtx, {
      personaId,
      isDisabled: true,
    });

    expect(result.success).toBe(true);
  });

  test("updates existing setting when toggling built-in persona", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-1" as Id<"personas">;
    const settingId = "setting-1" as Id<"userPersonaSettings">;

    const mockPersona = {
      _id: personaId,
      name: "Assistant",
      isBuiltIn: true,
      isActive: true,
    };

    const mockExistingSetting = {
      _id: settingId,
      userId,
      personaId,
      isDisabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockQuery = {
      withIndex: mock(function () {
        return this;
      }),
      eq: mock(function () {
        return this;
      }),
      first: mock(() => Promise.resolve(mockExistingSetting)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
        query: mock(() => mockQuery),
        patch: mock(
          (_table: string, id: Id<"userPersonaSettings">, data: any) => {
            expect(id).toBe(settingId);
            expect(data.isDisabled).toBe(true);
            expect(data.updatedAt).toBeGreaterThan(0);
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    const result = await toggleBuiltInPersonaHandler(ctx as MutationCtx, {
      personaId,
      isDisabled: true,
    });

    expect(result.success).toBe(true);
  });

  test("throws error when toggling non-built-in persona", async () => {
    const userId = "user-123" as Id<"users">;
    const personaId = "persona-1" as Id<"personas">;

    const mockPersona = {
      _id: personaId,
      name: "Custom",
      isBuiltIn: false,
      isActive: true,
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        get: mock(() => Promise.resolve(mockPersona)),
      },
    });

    await expect(
      toggleBuiltInPersonaHandler(ctx as MutationCtx, {
        personaId,
        isDisabled: true,
      })
    ).rejects.toThrow("Can only toggle built-in personas");
  });

  test("throws error for unauthenticated user", async () => {
    const personaId = "persona-1" as Id<"personas">;
    const ctx = makeUnauthenticatedCtx();

    await expect(
      toggleBuiltInPersonaHandler(ctx as MutationCtx, {
        personaId,
        isDisabled: true,
      })
    ).rejects.toThrow("User not authenticated");
  });
});

describe("personas.improvePrompt", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = undefined;
  });

  test("returns improved prompt", async () => {
    const improvedText = "You are a helpful assistant...";

    global.fetch = mock((url: string, options?: RequestInit) => {
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).toContain("test-key");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: improvedText }],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await improvePromptHandler({} as ActionCtx, {
      prompt: "Be helpful",
    });

    expect(result.improvedPrompt).toBe(improvedText);
  });

  test("throws error when API key not configured", async () => {
    process.env.GEMINI_API_KEY = undefined;

    await expect(
      improvePromptHandler({} as ActionCtx, {
        prompt: "Test",
      })
    ).rejects.toThrow("Gemini API key not configured");
  });

  test("throws error on API failure", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      } as Response);
    });

    await expect(
      improvePromptHandler({} as ActionCtx, {
        prompt: "Test",
      })
    ).rejects.toThrow("Gemini API error: 500");
  });

  test("throws error when no improvement generated", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [],
          }),
      } as Response);
    });

    await expect(
      improvePromptHandler({} as ActionCtx, {
        prompt: "Test",
      })
    ).rejects.toThrow("No improvement generated");
  });

  test("trims whitespace from improved prompt", async () => {
    global.fetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: "  Improved prompt  \n\n" }],
                },
              },
            ],
          }),
      } as Response);
    });

    const result = await improvePromptHandler({} as ActionCtx, {
      prompt: "Test",
    });

    expect(result.improvedPrompt).toBe("Improved prompt");
  });
});
