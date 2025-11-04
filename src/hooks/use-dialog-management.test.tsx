import { mock as createMock, describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook, waitForResult } from "../test/hook-utils";
import {
  useConfirmationDialog,
  useNotificationDialog,
} from "./use-dialog-management";

describe("use-dialog-management", () => {
  test("confirmation dialog flows: confirm, cancel, open change", async () => {
    const { result } = renderHook(() => useConfirmationDialog());
    const onConfirm = createMock();
    const onCancel = createMock();

    // open via confirm()
    act(() => {
      result.current.confirm(
        { title: "T", description: "D", confirmText: "OK" },
        onConfirm,
        onCancel
      );
    });
    await waitForResult(result, r => r.state.isOpen === true);
    expect(result.current.state.title).toBe("T");

    // confirm path closes and calls confirm
    act(() => {
      result.current.handleConfirm();
    });
    expect(onConfirm).toHaveBeenCalled();
    await waitForResult(result, r => r.state.isOpen === false);

    // reopen and cancel via handler
    act(() => {
      result.current.confirm(
        { title: "T2", description: "D2" },
        onConfirm,
        onCancel
      );
    });
    await waitForResult(result, r => r.state.isOpen === true);
    act(() => {
      result.current.handleCancel();
    });
    expect(onCancel).toHaveBeenCalled();

    // open change false triggers onCancel too
    act(() => {
      result.current.confirm(
        { title: "T3", description: "D3" },
        onConfirm,
        onCancel
      );
    });
    await waitForResult(result, r => r.state.isOpen === true);
    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  test("notification dialog flows: notify, action, open change", async () => {
    const { result } = renderHook(() => useNotificationDialog());
    const onAction = createMock();

    act(() => {
      result.current.notify(
        { title: "N", description: "D", actionText: "Got it" },
        onAction
      );
    });
    await waitForResult(result, r => r.state.isOpen === true);
    expect(result.current.state.title).toBe("N");

    act(() => {
      result.current.handleAction();
    });
    expect(onAction).toHaveBeenCalled();
    await waitForResult(result, r => r.state.isOpen === false);

    act(() => {
      result.current.handleOpenChange(true);
    });
    await waitForResult(result, r => r.state.isOpen === true);
  });
});
