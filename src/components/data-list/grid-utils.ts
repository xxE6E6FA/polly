/**
 * Utility functions for converting Tailwind width classes to CSS Grid template columns.
 * This enables automatic column alignment between headers and rows without manual synchronization.
 */

/**
 * Mapping of common Tailwind width classes to CSS values.
 * Used to convert Tailwind classes like "w-32" to "8rem" for grid-template-columns.
 */
const TAILWIND_WIDTH_MAP: Record<string, string> = {
  // Fixed widths (rem-based)
  "w-4": "1rem",
  "w-8": "2rem",
  "w-12": "3rem",
  "w-16": "4rem",
  "w-20": "5rem",
  "w-24": "6rem",
  "w-28": "7rem",
  "w-32": "8rem",
  "w-36": "9rem",
  "w-40": "10rem",
  "w-44": "11rem",
  "w-48": "12rem",
  "w-52": "13rem",
  "w-56": "14rem",
  "w-60": "15rem",
  "w-64": "16rem",
  "w-72": "18rem",
  "w-80": "20rem",
  "w-96": "24rem",
  // Fractional widths (percentage-based)
  "w-1/2": "50%",
  "w-1/3": "33.333333%",
  "w-2/3": "66.666667%",
  "w-1/4": "25%",
  "w-2/4": "50%",
  "w-3/4": "75%",
  "w-1/5": "20%",
  "w-2/5": "40%",
  "w-3/5": "60%",
  "w-4/5": "80%",
  "w-1/6": "16.666667%",
  "w-5/6": "83.333333%",
  // Full width
  "w-full": "100%",
};

/**
 * Extracts the width value from a Tailwind width class or returns a default flexible column.
 *
 * @param width - Tailwind width class string (e.g., "w-32 flex-shrink-0")
 * @returns CSS grid column value (e.g., "8rem" or "minmax(0, 1fr)")
 */
function parseWidthClass(width?: string): string {
  if (!width) {
    return "minmax(0, 1fr)";
  }

  // Extract width class from the string (e.g., "w-32" from "w-32 flex-shrink-0 ml-4")
  const widthClass = width
    .split(" ")
    .find(cls => cls.startsWith("w-") && TAILWIND_WIDTH_MAP[cls]);

  if (widthClass && TAILWIND_WIDTH_MAP[widthClass]) {
    return TAILWIND_WIDTH_MAP[widthClass];
  }

  // Check if there's a width class that wasn't recognized (development warning)
  const unrecognizedWidth = width.split(" ").find(cls => cls.startsWith("w-"));
  if (unrecognizedWidth && process.env.NODE_ENV === "development") {
    console.warn(
      `[DataList] Unrecognized width class: "${unrecognizedWidth}". Falling back to flexible column (minmax(0, 1fr)). Supported classes: w-{size} (4-96), w-{fraction} (1/2, 1/3, etc.), w-full.`
    );
  }

  // If no recognized width class, make it flexible
  return "minmax(0, 1fr)";
}

/**
 * Generates a CSS grid-template-columns value from column widths.
 *
 * @param columnWidths - Array of Tailwind width class strings
 * @param hasSelection - Whether a selection checkbox column should be included
 * @returns CSS grid-template-columns value
 *
 * @example
 * ```ts
 * const template = generateGridTemplate(["", "w-32", "w-48"], true);
 * // Returns: "auto minmax(0, 1fr) 8rem 12rem"
 * ```
 */
export function generateGridTemplate(
  columnWidths: (string | undefined)[],
  hasSelection = false
): string {
  const columns: string[] = [];

  // Add selection checkbox column if needed
  if (hasSelection) {
    columns.push("auto"); // Auto-size for checkbox
  }

  // Add data columns
  for (const width of columnWidths) {
    columns.push(parseWidthClass(width));
  }

  return columns.join(" ");
}
