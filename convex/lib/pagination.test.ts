import { describe, expect, test } from "bun:test";
import {
  configurePagination,
  createEmptyPaginationResult,
  DEFAULT_PAGE_SIZE,
  getPaginationConfig,
  MAX_PAGE_SIZE,
  validatePaginationOpts,
  validatePaginationOptsWithConfig,
} from "./pagination";

describe("pagination constants", () => {
  test("has correct default page size", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  test("has correct max page size", () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});

describe("configurePagination", () => {
  test("configures global pagination settings", () => {
    configurePagination({
      defaultPageSize: 10,
      maxPageSize: 50,
    });

    const config = getPaginationConfig();
    expect(config.defaultPageSize).toBe(10);
    expect(config.maxPageSize).toBe(50);

    // Reset to defaults
    configurePagination({});
  });

  test("uses defaults when not provided", () => {
    configurePagination({});

    const config = getPaginationConfig();
    expect(config.defaultPageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(config.maxPageSize).toBe(MAX_PAGE_SIZE);
  });
});

describe("getPaginationConfig", () => {
  test("returns current configuration", () => {
    const config = getPaginationConfig();
    expect(config).toHaveProperty("defaultPageSize");
    expect(config).toHaveProperty("maxPageSize");
    expect(typeof config.defaultPageSize).toBe("number");
    expect(typeof config.maxPageSize).toBe("number");
  });

  test("returns a copy, not the original object", () => {
    const config1 = getPaginationConfig();
    const config2 = getPaginationConfig();
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});

describe("validatePaginationOpts", () => {
  test("returns undefined when no opts provided", () => {
    const result = validatePaginationOpts();
    expect(result).toBeUndefined();
  });

  test("returns undefined when opts is undefined", () => {
    const result = validatePaginationOpts(undefined);
    expect(result).toBeUndefined();
  });

  test("uses default page size when numItems not provided", () => {
    const result = validatePaginationOpts({});
    expect(result?.numItems).toBe(DEFAULT_PAGE_SIZE);
    expect(result?.cursor).toBeNull();
  });

  test("validates numItems within bounds", () => {
    // Valid numItems
    let result = validatePaginationOpts({ numItems: 10 });
    expect(result?.numItems).toBe(10);

    // Too small - uses default since 0 is not > 0
    result = validatePaginationOpts({ numItems: 0 });
    expect(result?.numItems).toBe(DEFAULT_PAGE_SIZE);

    // Too large - should be clamped to max
    result = validatePaginationOpts({ numItems: 200 });
    expect(result?.numItems).toBe(MAX_PAGE_SIZE);

    // Negative - uses default since not > 0
    result = validatePaginationOpts({ numItems: -5 });
    expect(result?.numItems).toBe(DEFAULT_PAGE_SIZE);
  });

  test("handles decimal numItems", () => {
    const result = validatePaginationOpts({ numItems: 10.7 });
    expect(result?.numItems).toBe(10); // Should floor
  });

  test("handles invalid numItems", () => {
    const result = validatePaginationOpts({ numItems: NaN });
    expect(result?.numItems).toBe(DEFAULT_PAGE_SIZE);
  });

  test("preserves cursor", () => {
    const result = validatePaginationOpts({
      numItems: 10,
      cursor: "abc123",
    });
    expect(result?.cursor).toBe("abc123");
  });

  test("preserves null cursor", () => {
    const result = validatePaginationOpts({
      numItems: 10,
      cursor: null,
    });
    expect(result?.cursor).toBeNull();
  });

  test("preserves id when provided", () => {
    const result = validatePaginationOpts({
      numItems: 10,
      id: 42,
    });
    expect(result?.id).toBe(42);
  });

  test("omits id when not provided", () => {
    const result = validatePaginationOpts({ numItems: 10 });
    expect(result).not.toHaveProperty("id");
  });

  test("uses custom config when provided", () => {
    const result = validatePaginationOpts(
      { numItems: 10 },
      { defaultPageSize: 5, maxPageSize: 50 }
    );
    expect(result?.numItems).toBe(10);
  });
});

describe("validatePaginationOptsWithConfig", () => {
  test("passes parameters correctly to validatePaginationOpts", () => {
    const result = validatePaginationOptsWithConfig(
      { numItems: 15 },
      25,
      200
    );
    expect(result?.numItems).toBe(15);
  });

  test("uses provided default and max page sizes", () => {
    const result = validatePaginationOptsWithConfig(
      {},
      25,
      200
    );
    expect(result?.numItems).toBe(25);
  });
});

describe("createEmptyPaginationResult", () => {
  test("creates empty pagination result", () => {
    const result = createEmptyPaginationResult<string>();
    expect(result).toEqual({
      page: [],
      isDone: true,
      continueCursor: null,
    });
  });

  test("works with different types", () => {
    const result = createEmptyPaginationResult<number>();
    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBeNull();
  });
});
