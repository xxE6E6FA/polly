import { describe, expect, test } from "bun:test";
import React from "react";
import { renderUi } from "../../../test/test-utils";
import { Spinner } from "./spinner";

describe("<Spinner />", () => {
  test("renders with default size and variant", async () => {
    const { container } = await renderUi(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // default size is md -> has h-5 w-5 class
    expect(svg?.className).toContain("h-5");
    expect(svg?.className).toContain("w-5");
  });

  test("accepts size and variant props", async () => {
    const { container } = await renderUi(<Spinner size="lg" variant="white" />);
    const svg = container.querySelector("svg");
    expect(svg?.className).toContain("h-6");
    expect(svg?.className).toContain("w-6");
  });
});
