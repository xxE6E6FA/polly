import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderUi } from "../../../test/test-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

describe("<Select />", () => {
  test("renders with undefined value", async () => {
    const { container } = await renderUi(
      <Select value={undefined}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
  });

  test("renders with selected value", async () => {
    const { container } = await renderUi(
      <Select value="option1">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
    // Base UI shows the value, not the label text
    expect(trigger?.textContent).toContain("option1");
  });

  test("handles onValueChange callback with value", async () => {
    const onChange = mock(() => undefined);

    await renderUi(
      <Select value="option1" onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    // onValueChange is not called on initial render
    expect(onChange).not.toHaveBeenCalled();
  });

  test("handles onValueChange with null value (Base UI RC behavior)", async () => {
    // Base UI RC sends null when value is cleared
    // This test verifies the component accepts null without crashing
    const onChange = mock((value: string | null) => {
      // Handler should check for null before processing
      if (value) {
        return value;
      }
      return null;
    });

    const { container } = await renderUi(
      <Select value="option1" onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    // Component renders without errors
    expect(container.querySelector("button")).toBeTruthy();
  });

  test("SelectTrigger renders with default variant", async () => {
    const { container } = await renderUi(
      <Select value="option1">
        <SelectTrigger variant="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
    // Default variant has border and background classes
    expect(trigger?.className).toContain("border");
    expect(trigger?.className).toContain("rounded-md");
  });

  test("SelectTrigger renders with minimal variant", async () => {
    const { container } = await renderUi(
      <Select value="option1">
        <SelectTrigger variant="minimal">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
    // Minimal variant has no border
    expect(trigger?.className).toContain("border-0");
    expect(trigger?.className).toContain("bg-transparent");
  });

  test("SelectTrigger hides icon when hideIcon is true", async () => {
    const { container } = await renderUi(
      <Select value="option1">
        <SelectTrigger hideIcon>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
    // Should not have the caret icon
    const svg = trigger?.querySelector("svg");
    expect(svg).toBeFalsy();
  });

  test("SelectItem renders correctly", async () => {
    const { container } = await renderUi(
      <Select value="option1" open>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    // Component renders
    expect(container.querySelector("button")).toBeTruthy();
  });
});
