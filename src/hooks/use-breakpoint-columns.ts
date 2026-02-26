import { type RefObject, useEffect, useState } from "react";

const BREAKPOINTS = [
  { minWidth: 1400, columns: 6 },
  { minWidth: 1150, columns: 5 },
  { minWidth: 900, columns: 4 },
  { minWidth: 650, columns: 3 },
  { minWidth: 400, columns: 2 },
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
