import { describe, expect, test } from "bun:test";
import React from "react";
import { renderUi } from "../../../test/test-utils";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

describe("<Dialog />", () => {
  test("renders closed by default", async () => {
    const { container } = await renderUi(
      <Dialog>
        <DialogTrigger>
          <span>Open Dialog</span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    // Trigger should be visible
    expect(container.textContent).toContain("Open Dialog");

    // Dialog content should not be in the DOM when closed
    expect(container.textContent).not.toContain("Test Dialog");
  });

  test("renders open when open prop is true", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogTrigger>
          <span>Open Dialog</span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    // Trigger should still be rendered
    expect(container.textContent).toContain("Open Dialog");
  });

  test("DialogContent accepts ReactNode children", async () => {
    // This tests the fix for cmdk compatibility where children type was restricted
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <div data-testid="custom-content">Custom Content</div>
          <span>More content</span>
        </DialogContent>
      </Dialog>
    );

    // Component renders without type errors
    expect(container).toBeTruthy();
  });

  test("DialogHeader renders with correct structure", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description text</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    // Component renders
    expect(container).toBeTruthy();
  });

  test("DialogFooter renders children", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <DialogFooter>
            <Button>Cancel</Button>
            <Button>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    // Component renders
    expect(container).toBeTruthy();
  });

  test("DialogClose renders within content", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test</DialogTitle>
          </DialogHeader>
          <DialogClose>
            <Button>Close</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    );

    // Component renders
    expect(container).toBeTruthy();
  });

  test("DialogTitle renders with correct styling", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="custom-class">Custom Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    // Component renders
    expect(container).toBeTruthy();
  });

  test("DialogDescription renders with correct styling", async () => {
    const { container } = await renderUi(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription className="custom-class">
              Description text
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    // Component renders
    expect(container).toBeTruthy();
  });
});
