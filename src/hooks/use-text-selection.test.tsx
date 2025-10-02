import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useCallback, useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTextSelection } from "./use-text-selection";

// Make debounced callback immediate BUT stable across renders to avoid re-subscribing
vi.mock("./use-debounce", () => ({
  useDebouncedCallback: (fn: () => void) => {
    const ref = useRef(fn);
    ref.current = fn;
    return useCallback(() => {
      ref.current();
    }, []);
  },
}));

type SelectionAPI = ReturnType<typeof useTextSelection>;

function harness({ onUpdate }: { onUpdate: (v: SelectionAPI) => void }) {
  const api = useTextSelection();
  useEffect(() => {
    onUpdate(api);
  }, [api, onUpdate]);
  return (
    <div>
      <div data-message-role="assistant" id="assistant">
        Assistant says: <span id="text">hello world example</span>
      </div>
      <div data-message-role="user" id="user">
        User text here
      </div>
    </div>
  );
}
const Harness = harness;

describe("use-text-selection", () => {
  let fakeSelText = "";
  let fakeContainer: Element | null = null;
  beforeEach(() => {
    vi.spyOn(window, "getSelection").mockImplementation((): Selection => {
      const cac: Node = fakeContainer
        ? ({
            nodeType: Node.TEXT_NODE,
            parentElement: fakeContainer,
          } as unknown as Node)
        : (document.body as unknown as Node);
      const range = {
        getBoundingClientRect: () => new DOMRect(0, 0, 10, 10),
        commonAncestorContainer: cac,
      } as unknown as Range;
      const sel = {
        rangeCount: fakeSelText ? 1 : 0,
        getRangeAt: () => range,
        toString: () => fakeSelText,
        removeAllRanges: () => {
          fakeSelText = "";
          fakeContainer = null;
        },
      } as unknown as Selection;
      return sel;
    });
  });
  afterEach(() => {
    const sel = window.getSelection();
    sel?.removeAllRanges?.();
    vi.restoreAllMocks();
  });

  async function selectElementText(el: Element, text: string) {
    fakeSelText = text;
    fakeContainer = el;
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    // Fire a second tick to ensure the hook's effect listener is attached
    await Promise.resolve();
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
  }

  it("sets selection only for multi-word assistant selections", async () => {
    let snap: SelectionAPI | undefined;
    const { container } = render(
      <Harness
        onUpdate={v => {
          snap = v;
        }}
      />
    );
    await waitFor(() => {
      expect(snap).toBeTruthy();
    });
    const span = container.querySelector("#text") as HTMLElement | null;
    expect(span).not.toBeNull();
    await selectElementText(span as Element, "hello"); // single word
    await waitFor(() => {
      expect(snap?.selection).toBeNull();
    });

    await selectElementText(span as Element, "hello world example"); // multi-word
    await waitFor(() => {
      expect(snap?.selection?.text).toBe("hello world example");
      expect(snap?.selection?.isInAssistantMessage).toBe(true);
    });
  });

  it("ignores selections outside assistant", async () => {
    let snap: SelectionAPI | undefined;
    const { container } = render(
      <Harness
        onUpdate={v => {
          snap = v;
        }}
      />
    );
    await waitFor(() => {
      expect(snap).toBeTruthy();
    });
    const user = container.querySelector("#user") as HTMLElement | null;
    expect(user).not.toBeNull();
    await selectElementText(user as Element, "User");
    await waitFor(() => {
      expect(snap?.selection).toBeNull();
    });
  });

  it("addQuoteToInput formats quote and clears selection", async () => {
    let snap: SelectionAPI | undefined;
    const { container } = render(
      <Harness
        onUpdate={v => {
          snap = v;
        }}
      />
    );
    await waitFor(() => {
      expect(snap).toBeTruthy();
    });
    const span = container.querySelector("#text") as HTMLElement | null;
    expect(span).not.toBeNull();
    await selectElementText(span as Element, "hello world example");
    await waitFor(() => {
      expect(snap?.selection?.text).toBe("hello world example");
    });
    const onAdd = vi.fn();
    act(() => {
      snap?.addQuoteToInput(onAdd);
    });
    expect(onAdd).toHaveBeenCalled();
    const quoted = onAdd.mock.calls[0][0] as string;
    expect(quoted.split("\n")[0].startsWith("> ")).toBe(true);
    await waitFor(() => {
      expect(snap?.selection).toBeNull();
    });
  });

  it("clearSelection respects lock", async () => {
    let snap: SelectionAPI | undefined;
    const { container } = render(
      <Harness
        onUpdate={v => {
          snap = v;
        }}
      />
    );
    await waitFor(() => {
      expect(snap).toBeTruthy();
    });
    const span = container.querySelector("#text") as HTMLElement | null;
    expect(span).not.toBeNull();
    await selectElementText(span as Element, "hello world example");
    await waitFor(() => {
      expect(snap?.selection).not.toBeNull();
    });
    act(() => {
      snap?.lockSelection();
      snap?.clearSelection();
    });
    await waitFor(() => {
      expect(snap?.selection).not.toBeNull();
    });
    act(() => {
      snap?.unlockSelection();
      snap?.clearSelection();
    });
    await waitFor(() => {
      expect(snap?.selection).toBeNull();
    });
  });

  it("click outside clears selection when unlocked", async () => {
    let snap: SelectionAPI | undefined;
    const { container } = render(
      <Harness
        onUpdate={v => {
          snap = v;
        }}
      />
    );
    await waitFor(() => {
      expect(snap).toBeTruthy();
    });
    const span = container.querySelector("#text") as HTMLElement | null;
    expect(span).not.toBeNull();
    selectElementText(span as Element, "hello world example");
    await waitFor(() => {
      expect(snap?.selection).not.toBeNull();
    });
    act(() => {
      fireEvent.click(document.body);
    });
    await waitFor(() => {
      expect(snap?.selection).toBeNull();
    });
  });
});
