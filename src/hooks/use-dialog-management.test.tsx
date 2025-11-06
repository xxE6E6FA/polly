import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import {
  useConfirmationDialog,
  useNotificationDialog,
} from "./use-dialog-management";

describe("useConfirmationDialog", () => {
  test("confirm triggers callbacks and closes", () => {
    let confirmCount = 0;
    let cancelCount = 0;
    const onConfirm = () => {
      confirmCount += 1;
    };
    const onCancel = () => {
      cancelCount += 1;
    };

    const { result } = renderHook(() => useConfirmationDialog());

    act(() => {
      result.current.confirm(
        { title: "Delete", description: "Are you sure?", confirmText: "Yes" },
        onConfirm,
        onCancel
      );
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      title: "Delete",
      description: "Are you sure?",
      confirmText: "Yes",
    });

    act(() => {
      result.current.handleConfirm();
    });

    expect(confirmCount).toBe(1);
    expect(result.current.state.isOpen).toBe(false);

    act(() => {
      result.current.confirm(
        { title: "Again", description: "Confirm?" },
        onConfirm,
        onCancel
      );
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(cancelCount).toBe(1);
    expect(result.current.state.isOpen).toBe(false);
  });

  test("handleCancel invokes cancel callback", () => {
    let cancelCount = 0;
    const onCancel = () => {
      cancelCount += 1;
    };
    const { result } = renderHook(() => useConfirmationDialog());

    act(() => {
      result.current.confirm(
        { title: "Cancel", description: "?" },
        () => {
          /* empty */
        },
        onCancel
      );
    });

    act(() => {
      result.current.handleCancel();
    });

    expect(cancelCount).toBe(1);
    expect(result.current.state.isOpen).toBe(false);
  });
});

describe("useNotificationDialog", () => {
  test("notify stores options and action callback", () => {
    let actionCount = 0;
    const onAction = () => {
      actionCount += 1;
    };
    const { result } = renderHook(() => useNotificationDialog());

    act(() => {
      result.current.notify(
        {
          title: "Saved",
          description: "It worked",
          type: "success",
          actionText: "Undo",
        },
        onAction
      );
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      title: "Saved",
      description: "It worked",
      type: "success",
      actionText: "Undo",
    });

    act(() => {
      result.current.handleAction();
    });

    expect(actionCount).toBe(1);
    expect(result.current.state.isOpen).toBe(false);

    act(() => {
      result.current.handleOpenChange(true);
    });
    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(result.current.state.isOpen).toBe(false);
  });
});
