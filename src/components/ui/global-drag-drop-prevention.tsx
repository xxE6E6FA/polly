import { useEffect } from "react";

export function GlobalDragDropPrevention() {
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    // Prevent the default browser behavior for drag and drop
    // This prevents accidentally navigating away when files are dropped
    // outside of designated drop zones
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, []);

  return null;
}
