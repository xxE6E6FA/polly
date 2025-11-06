import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { ConversationId } from "@/types";
import {
  BatchSelectionProvider,
  useBatchSelection,
} from "./batch-selection-context";

const conversationIds = [
  "c1",
  "c2",
  "c3",
  "c4",
] as unknown as readonly ConversationId[];

function idsText() {
  const text = screen.getByTestId("selected-ids").textContent ?? "";
  return text === "" ? [] : text.split(",");
}

function BatchHarness() {
  const ctx = useBatchSelection();
  const ids = ctx.getSelectedIds();
  return (
    <div>
      <div data-testid="selected-ids">{ids.join(",")}</div>
      <div data-testid="selection-count">{ctx.selectionCount}</div>
      <button onClick={() => ctx.toggleSelection("c1" as ConversationId)}>
        toggle-c1
      </button>
      <button onClick={() => ctx.toggleSelection("c2" as ConversationId)}>
        toggle-c2
      </button>
      <button
        onClick={() =>
          ctx.selectAllVisible(conversationIds as ConversationId[])
        }
      >
        select-all
      </button>
      <button
        onClick={() =>
          ctx.selectRange(
            "c3" as ConversationId,
            conversationIds as ConversationId[]
          )
        }
      >
        select-range-c3
      </button>
      <button onClick={() => ctx.clearSelection()}>clear</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <BatchSelectionProvider>
      <BatchHarness />
    </BatchSelectionProvider>
  );
}

describe("BatchSelectionProvider", () => {
  test("toggleSelection adds/removes conversations", () => {
    renderHarness();

    fireEvent.click(screen.getByText("toggle-c1"));
    expect(idsText()).toEqual(["c1"]);
    expect(screen.getByTestId("selection-count").textContent).toBe("1");

    fireEvent.click(screen.getByText("toggle-c1"));
    expect(idsText()).toEqual([]);
    expect(screen.getByTestId("selection-count").textContent).toBe("0");
  });

  test("selectRange selects contiguous conversations", () => {
    renderHarness();

    fireEvent.click(screen.getByText("toggle-c1"));
    fireEvent.click(screen.getByText("select-range-c3"));

    expect(idsText().sort()).toEqual(["c1", "c2", "c3"]);
    expect(screen.getByTestId("selection-count").textContent).toBe("3");
  });

  test("selectAllVisible and clearSelection", () => {
    renderHarness();

    fireEvent.click(screen.getByText("select-all"));
    expect(idsText().sort()).toEqual([...conversationIds]);

    fireEvent.click(screen.getByText("clear"));
    expect(idsText()).toEqual([]);
    expect(screen.getByTestId("selection-count").textContent).toBe("0");
  });
});
