import { describe, expect, it } from "vitest";
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

describe("type-guards", () => {
  it("basic doc guards", () => {
    const user = { _id: "1;users", _creationTime: Date.now() };
    expect(isUser(user)).toBe(true);
    expect(isUser({})).toBe(false);

    const persona = { _id: "1;personas", name: "P" };
    expect(isPersona(persona)).toBe(true);
    expect(isPersona({})).toBe(false);

    const apiKey = { provider: "openai" };
    expect(isUserApiKey(apiKey)).toBe(true);

    const userModel = {
      _id: "1;userModels",
      modelId: "m",
      provider: "p",
    };
    expect(isUserModel(userModel)).toBe(true);
  });

  it("array guards", () => {
    const personas = [{ _id: "1;personas", name: "a" }];
    expect(isPersonaArray(personas)).toBe(true);
    expect(isPersonaArray([{}])).toBe(false);

    const apiKeys = [{ provider: "openai" }];
    expect(isApiKeysArray(apiKeys)).toBe(true);

    const userModels = [{ _id: "1;userModels", modelId: "m", provider: "p" }];
    expect(isUserModelsArray(userModels)).toBe(true);
  });

  it("user settings and monthly usage", () => {
    const settings = {
      userId: "u",
      personasEnabled: true,
      openRouterSorting: "default",
      anonymizeForDemo: false,
      autoArchiveEnabled: false,
      autoArchiveDays: 30,
    };
    expect(isUserSettings(settings)).toBe(true);

    const usage = {
      monthlyMessagesSent: 10,
      monthlyLimit: 100,
      remainingMessages: 90,
    };
    expect(isMonthlyUsage(usage)).toBe(true);
  });

  it("hasPageArray", () => {
    expect(hasPageArray({ page: [] })).toBe(true);
    expect(hasPageArray({})).toBe(false);
  });
});
