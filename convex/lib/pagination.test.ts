import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  configurePagination,
  getPaginationConfig,
  validatePaginationOpts,
  validatePaginationOptsWithConfig,
  createEmptyPaginationResult,
} from "./pagination";

describe("convex/lib/pagination", () => {
  const original = getPaginationConfig();

  beforeEach(() => {
    // reset to defaults before each test
    configurePagination({
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    });
  });

  afterEach(() => {
    // ensure global state is restored
    configurePagination({
      defaultPageSize: original.defaultPageSize,
      maxPageSize: original.maxPageSize,
    });
  });

  it("returns undefined when opts is not provided", () => {
    expect(validatePaginationOpts(undefined as any)).toBeUndefined();
  });

  it("validates and normalizes pagination options", () => {
    // valid numItems with implicit cursor null
    expect(
      validatePaginationOpts({ numItems: 5 })
    ).toEqual({ numItems: 5, cursor: null });

    // negative/zero falls back to default
    expect(
      validatePaginationOpts({ numItems: 0 })
    ).toEqual({ numItems: DEFAULT_PAGE_SIZE, cursor: null });
    expect(
      validatePaginationOpts({ numItems: -10, cursor: "abc" })
    ).toEqual({ numItems: DEFAULT_PAGE_SIZE, cursor: "abc" });

    // max bound respected
    expect(
      validatePaginationOpts({ numItems: MAX_PAGE_SIZE + 100 })
    ).toEqual({ numItems: MAX_PAGE_SIZE, cursor: null });

    // floor non-integer and preserve id field
    expect(
      validatePaginationOpts({ numItems: 3.9, id: 123 })
    ).toEqual({ numItems: 3, cursor: null, id: 123 });
  });

  it("supports per-call config override", () => {
    const res = validatePaginationOptsWithConfig(
      { numItems: 999 },
      7,
      42
    );
    expect(res).toEqual({ numItems: 42, cursor: null });
  });

  it("allows reconfiguring global defaults", () => {
    configurePagination({ defaultPageSize: 10, maxPageSize: 15 });
    expect(getPaginationConfig()).toEqual({ defaultPageSize: 10, maxPageSize: 15 });

    // with invalid numItems falls back to new default
    expect(
      validatePaginationOpts({ numItems: NaN as unknown as number })
    ).toEqual({ numItems: 10, cursor: null });
  });

  it("creates an empty pagination result", () => {
    const res = createEmptyPaginationResult<string>();
    expect(res.page).toEqual([]);
    expect(res.isDone).toBe(true);
    expect(res.continueCursor).toBeNull();
  });
});
