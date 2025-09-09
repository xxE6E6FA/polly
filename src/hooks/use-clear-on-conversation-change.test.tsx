import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { useClearOnConversationChange } from "./use-clear-on-conversation-change";

function harness({
  keyVal,
  clear,
  onRender,
}: {
  keyVal: string;
  clear: (k: string) => void;
  onRender: () => void;
}) {
  useClearOnConversationChange(keyVal, clear);
  useEffect(() => {
    onRender();
  }, [onRender]);
  return <div />;
}
const Harness = harness;

describe("use-clear-on-conversation-change", () => {
  it("calls clear with previous key when key changes", () => {
    const clear = vi.fn();
    const onRender = vi.fn();
    const { rerender } = render(
      <Harness keyVal="a" clear={clear} onRender={onRender} />
    );
    expect(clear).not.toHaveBeenCalled();
    // change key triggers clear of previous
    rerender(<Harness keyVal="b" clear={clear} onRender={onRender} />);
    expect(clear).toHaveBeenCalledWith("a");
    // another change clears previous again
    rerender(<Harness keyVal="c" clear={clear} onRender={onRender} />);
    expect(clear).toHaveBeenCalledWith("b");
  });
});
