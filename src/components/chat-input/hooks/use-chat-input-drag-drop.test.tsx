import { describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";
import { makeFileList } from "../../../test/utils";
import { useChatInputDragDrop } from "./use-chat-input-drag-drop";

function makeEvent(overrides: Partial<React.DragEvent>): React.DragEvent {
  const e = {
    preventDefault: mock(),
    stopPropagation: mock(),
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 100,
      }),
    },
    clientX: 0,
    clientY: 0,
    dataTransfer: {
      files: makeFileList([]),
      dropEffect: "copy",
      effectAllowed: "copy",
    } as DataTransfer,
    ...overrides,
  } as React.DragEvent;
  return e;
}

describe("useChatInputDragDrop", () => {
  test("toggles isDragOver on drag over/leave and only leaves when outside bounds", () => {
    const onProcessFiles = mock();
    const { result } = renderHook(() =>
      useChatInputDragDrop({
        canSend: true,
        isLoading: false,
        isStreaming: false,
        onProcessFiles,
      })
    );

    // Drag over sets flag
    act(() => result.current.handleDragOver(makeEvent({})));
    expect(result.current.isDragOver).toBe(true);

    // Drag leave inside container keeps flag
    act(() =>
      result.current.handleDragLeave(makeEvent({ clientX: 50, clientY: 50 }))
    );
    expect(result.current.isDragOver).toBe(true);

    // Drag leave outside clears flag
    act(() =>
      result.current.handleDragLeave(makeEvent({ clientX: 150, clientY: 150 }))
    );
    expect(result.current.isDragOver).toBe(false);
  });

  test("drops call onProcessFiles only when allowed and files present", async () => {
    const onProcessFiles = mock().mockResolvedValue(undefined);
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    const files = makeFileList([file]);
    const { result, rerender } = renderHook(
      ({ canSend, isLoading, isStreaming }) =>
        useChatInputDragDrop({
          canSend,
          isLoading,
          isStreaming,
          onProcessFiles,
        }),
      { initialProps: { canSend: true, isLoading: false, isStreaming: false } }
    );

    // Allowed path
    await act(async () =>
      result.current.handleDrop(
        makeEvent({
          dataTransfer: {
            files,
            dropEffect: "copy",
            effectAllowed: "copy",
          } as DataTransfer,
        })
      )
    );
    expect(onProcessFiles).toHaveBeenCalledWith(files);
    onProcessFiles.mockClear();

    // Blocked by canSend = false
    rerender({ canSend: false, isLoading: false, isStreaming: false });
    await act(async () =>
      result.current.handleDrop(
        makeEvent({
          dataTransfer: {
            files,
            dropEffect: "copy",
            effectAllowed: "copy",
          } as DataTransfer,
        })
      )
    );
    expect(onProcessFiles).not.toHaveBeenCalled();
    onProcessFiles.mockClear();

    // Blocked by isLoading
    rerender({ canSend: true, isLoading: true, isStreaming: false });
    await act(async () =>
      result.current.handleDrop(
        makeEvent({
          dataTransfer: {
            files,
            dropEffect: "copy",
            effectAllowed: "copy",
          } as DataTransfer,
        })
      )
    );
    expect(onProcessFiles).not.toHaveBeenCalled();
    onProcessFiles.mockClear();

    // Blocked by isStreaming
    rerender({ canSend: true, isLoading: false, isStreaming: true });
    await act(async () =>
      result.current.handleDrop(
        makeEvent({
          dataTransfer: {
            files,
            dropEffect: "copy",
            effectAllowed: "copy",
          } as DataTransfer,
        })
      )
    );
    expect(onProcessFiles).not.toHaveBeenCalled();
    onProcessFiles.mockClear();

    // No files => no call
    rerender({ canSend: true, isLoading: false, isStreaming: false });
    await act(async () =>
      result.current.handleDrop(
        makeEvent({
          dataTransfer: {
            files: makeFileList([]),
            dropEffect: "copy",
            effectAllowed: "copy",
          } as DataTransfer,
        })
      )
    );
    expect(onProcessFiles).not.toHaveBeenCalled();
  });
});
