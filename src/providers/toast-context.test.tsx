import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";

type ToastCall = [message: string, options?: Record<string, unknown>];

const successCalls: ToastCall[] = [];
const errorCalls: ToastCall[] = [];
const loadingCalls: ToastCall[] = [];
const dismissCalls: Array<string | number | undefined> = [];

const mockToast = {
  success: (...args: ToastCall) => {
    successCalls.push(args);
  },
  error: (...args: ToastCall) => {
    errorCalls.push(args);
  },
  loading: (...args: ToastCall) => {
    loadingCalls.push(args);
    const [, options] = args;
    return options?.id ?? "generated-id";
  },
  dismiss: (id?: string | number) => {
    dismissCalls.push(id);
  },
};

mock.module("sonner", () => ({ toast: mockToast }));

const { ToastProvider, useToast } = await import("./toast-context");

function ToastHarness() {
  const { success, error, loading, dismiss, dismissAll } = useToast();
  const [loadingId, setLoadingId] = useState<string | number | undefined>();

  return (
    <div>
      <button onClick={() => success("Saved", { description: "ok" })}>
        success
      </button>
      <button onClick={() => error("Oops", { id: "err-1" })}>error</button>
      <button
        onClick={() => {
          const id = loading("Saving", { id: "load-1" });
          setLoadingId(id);
        }}
      >
        loading
      </button>
      <button onClick={() => dismiss("toast-123")}>dismiss-one</button>
      <button onClick={() => dismissAll()}>dismiss-all</button>
      <div data-testid="loading-id">{String(loadingId ?? "")}</div>
    </div>
  );
}

beforeEach(() => {
  successCalls.length = 0;
  errorCalls.length = 0;
  loadingCalls.length = 0;
  dismissCalls.length = 0;
});

describe("ToastProvider", () => {
  test("forwards success/error/loading calls to sonner", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("success"));
    expect(successCalls).toEqual([["Saved", { description: "ok" }]]);

    fireEvent.click(screen.getByText("error"));
    expect(errorCalls).toEqual([["Oops", { id: "err-1" }]]);

    fireEvent.click(screen.getByText("loading"));
    expect(loadingCalls).toEqual([["Saving", { id: "load-1" }]]);
    expect(screen.getByTestId("loading-id").textContent).toBe("load-1");
  });

  test("dismiss handles single id and dismissAll", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("dismiss-one"));
    fireEvent.click(screen.getByText("dismiss-all"));

    expect(dismissCalls).toEqual(["toast-123", undefined]);
  });
});
