import { type RefObject, useEffect, useState } from "react";

const BREAKPOINTS = [
  { minWidth: 1280, columns: 4 }, // xl
  { minWidth: 1024, columns: 3 }, // lg
  { minWidth: 640, columns: 2 }, // sm
];
const DEFAULT_COLUMNS = 1;

/**
 * Returns a responsive column count based on the observed width
 * of a container element, matching Tailwind's sm/lg/xl breakpoints.
 */
export function useBreakpointColumns(
  ref: RefObject<HTMLElement | null>
): number {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      let next = DEFAULT_COLUMNS;
      for (const bp of BREAKPOINTS) {
        if (width >= bp.minWidth) {
          next = bp.columns;
          break;
        }
      }
      setColumns(next);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}
