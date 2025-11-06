import { describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { createHashMemoComparison, usePropsHash } from "./use-props-hash";

describe("usePropsHash", () => {
  test("returns stable hash for structurally equal props", () => {
    const { result, rerender } = renderHook(
      ({ props }) => usePropsHash(props),
      {
        initialProps: { props: { foo: "bar", count: 1 } },
      }
    );

    const firstHash = result.current;

    rerender({ props: { count: 1, foo: "bar" } });
    expect(result.current).toBe(firstHash);

    rerender({ props: { foo: "bar", count: 2 } });
    expect(result.current).not.toBe(firstHash);
  });
});

describe("createHashMemoComparison", () => {
  test("ignores excluded keys when comparing", () => {
    const compare = createHashMemoComparison<{
      value: number;
      temp?: number;
      onChange: () => void;
    }>(["temp"]);

    const handler = () => {
      /* no-op mock */
    };

    expect(
      compare(
        { value: 1, temp: 1, onChange: handler },
        { value: 1, temp: 999, onChange: handler }
      )
    ).toBe(true);
  });

  test("detects significant prop changes", () => {
    const compare = createHashMemoComparison<{
      value: number;
      items: string[];
      onChange: () => void;
    }>();

    const handler = () => {
      /* no-op mock */
    };

    expect(
      compare(
        { value: 1, items: ["a"], onChange: handler },
        { value: 1, items: ["a"], onChange: handler }
      )
    ).toBe(true);

    expect(
      compare(
        { value: 1, items: ["a"], onChange: handler },
        { value: 2, items: ["a"], onChange: handler }
      )
    ).toBe(false);

    expect(
      compare(
        { value: 1, items: ["a"], onChange: handler },
        { value: 1, items: ["a", "b"], onChange: handler }
      )
    ).toBe(false);
  });
});
