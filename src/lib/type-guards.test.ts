import { describe, expect, test } from "bun:test";
import {
  hasPageArray,
  isApiKeysArray,
  isMonthlyUsage,
  isPersona,
  isPersonaArray,
  isUser,
  isUserApiKey,
  isUserModel,
  isUserModelsArray,
  isUserSettings,
} from "./type-guards";

describe("isUser", () => {
  test("returns true for valid user object", () => {
    const user = {
      _id: "user-123",
      _creationTime: 1234567890,
      name: "Test User",
    };

    expect(isUser(user)).toBe(true);
  });

  test("returns false for missing _id", () => {
    const user = {
      _creationTime: 1234567890,
      name: "Test User",
    };

    expect(isUser(user)).toBe(false);
  });

  test("returns false for missing _creationTime", () => {
    const user = {
      _id: "user-123",
      name: "Test User",
    };

    expect(isUser(user)).toBe(false);
  });

  test("returns false for null/undefined", () => {
    expect(isUser(null)).toBe(false);
    expect(isUser(undefined)).toBe(false);
  });

  test("returns false for non-objects", () => {
    expect(isUser("string")).toBe(false);
    expect(isUser(123)).toBe(false);
    expect(isUser(true)).toBe(false);
  });
});

describe("isUserSettings", () => {
  test("returns true for valid settings", () => {
    const settings = {
      userId: "user-123",
      personasEnabled: true,
      openRouterSorting: "default" as const,
      anonymizeForDemo: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
    };

    expect(isUserSettings(settings)).toBe(true);
  });

  test("returns false for missing required fields", () => {
    const incomplete = {
      userId: "user-123",
      personasEnabled: true,
    };

    expect(isUserSettings(incomplete)).toBe(false);
  });

  test("returns false for wrong types", () => {
    const invalid = {
      userId: 123,
      personasEnabled: true,
      openRouterSorting: "default",
      anonymizeForDemo: false,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
    };

    expect(isUserSettings(invalid)).toBe(false);
  });
});

describe("isPersona", () => {
  test("returns true for valid persona", () => {
    const persona = {
      _id: "persona-123",
      name: "Test Persona",
      description: "A test persona",
    };

    expect(isPersona(persona)).toBe(true);
  });

  test("returns false for missing name", () => {
    const persona = {
      _id: "persona-123",
      description: "A test persona",
    };

    expect(isPersona(persona)).toBe(false);
  });

  test("returns false for non-string name", () => {
    const persona = {
      _id: "persona-123",
      name: 123,
    };

    expect(isPersona(persona)).toBe(false);
  });
});

describe("isUserApiKey", () => {
  test("returns true for valid API key object", () => {
    const apiKey = {
      provider: "openai",
      key: "sk-test-123",
    };

    expect(isUserApiKey(apiKey)).toBe(true);
  });

  test("returns false for missing provider", () => {
    const apiKey = {
      key: "sk-test-123",
    };

    expect(isUserApiKey(apiKey)).toBe(false);
  });

  test("returns false for non-string provider", () => {
    const apiKey = {
      provider: 123,
      key: "sk-test-123",
    };

    expect(isUserApiKey(apiKey)).toBe(false);
  });
});

describe("isUserModel", () => {
  test("returns true for valid user model", () => {
    const model = {
      _id: "model-123",
      modelId: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
    };

    expect(isUserModel(model)).toBe(true);
  });

  test("returns false for missing required fields", () => {
    const model = {
      _id: "model-123",
      modelId: "gpt-4o",
    };

    expect(isUserModel(model)).toBe(false);
  });
});

describe("isPersonaArray", () => {
  test("returns true for valid persona array", () => {
    const personas = [
      { _id: "p1", name: "Persona 1" },
      { _id: "p2", name: "Persona 2" },
    ];

    expect(isPersonaArray(personas)).toBe(true);
  });

  test("returns true for empty array", () => {
    expect(isPersonaArray([])).toBe(true);
  });

  test("returns false for array with invalid persona", () => {
    const personas = [{ _id: "p1", name: "Persona 1" }, { _id: "p2" }];

    expect(isPersonaArray(personas)).toBe(false);
  });

  test("returns false for non-array", () => {
    expect(isPersonaArray("not an array")).toBe(false);
    expect(isPersonaArray({ _id: "p1", name: "Persona 1" })).toBe(false);
  });
});

describe("isApiKeysArray", () => {
  test("returns true for valid API keys array", () => {
    const keys = [
      { provider: "openai", key: "sk-1" },
      { provider: "anthropic", key: "sk-2" },
    ];

    expect(isApiKeysArray(keys)).toBe(true);
  });

  test("returns false for invalid items", () => {
    const keys = [{ provider: "openai" }, { key: "sk-2" }];

    expect(isApiKeysArray(keys)).toBe(false);
  });
});

describe("isUserModelsArray", () => {
  test("returns true for valid user models array", () => {
    const models = [
      { _id: "m1", modelId: "gpt-4o", provider: "openai" },
      { _id: "m2", modelId: "claude-3", provider: "anthropic" },
    ];

    expect(isUserModelsArray(models)).toBe(true);
  });

  test("returns false for invalid items", () => {
    const models = [
      { _id: "m1", modelId: "gpt-4o", provider: "openai" },
      { _id: "m2", modelId: "claude-3" },
    ];

    expect(isUserModelsArray(models)).toBe(false);
  });
});

describe("isMonthlyUsage", () => {
  test("returns true for valid monthly usage", () => {
    const usage = {
      monthlyMessagesSent: 50,
      monthlyLimit: 500,
      remainingMessages: 450,
      resetDate: 1234567890,
    };

    expect(isMonthlyUsage(usage)).toBe(true);
  });

  test("returns true without optional resetDate", () => {
    const usage = {
      monthlyMessagesSent: 50,
      monthlyLimit: 500,
      remainingMessages: 450,
    };

    expect(isMonthlyUsage(usage)).toBe(true);
  });

  test("returns false for missing required fields", () => {
    const usage = {
      monthlyMessagesSent: 50,
      remainingMessages: 450,
    };

    expect(isMonthlyUsage(usage)).toBe(false);
  });

  test("returns false for non-number values", () => {
    const usage = {
      monthlyMessagesSent: "50",
      monthlyLimit: 500,
      remainingMessages: 450,
    };

    expect(isMonthlyUsage(usage)).toBe(false);
  });
});

describe("hasPageArray", () => {
  test("returns true for object with page array", () => {
    const result = {
      page: [1, 2, 3],
      isDone: true,
    };

    expect(hasPageArray(result)).toBe(true);
  });

  test("returns true for empty page array", () => {
    const result = {
      page: [],
      isDone: true,
    };

    expect(hasPageArray(result)).toBe(true);
  });

  test("returns false for missing page property", () => {
    const result = {
      isDone: true,
    };

    expect(hasPageArray(result)).toBe(false);
  });

  test("returns false for non-array page", () => {
    const result = {
      page: "not an array",
      isDone: true,
    };

    expect(hasPageArray(result)).toBe(false);
  });
});
