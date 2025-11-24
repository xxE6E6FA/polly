/**
 * Formats a model's context length into short and long display strings.
 * Handles both thousands (K) and millions (M) of tokens.
 *
 * @param contextLength - The context length in tokens
 * @returns An object with short and long format strings, or null if no context length
 *
 * @example
 * formatContextLength(128000) // { short: "128K", long: "128K tokens" }
 * formatContextLength(2000000) // { short: "2M", long: "2M tokens" }
 * formatContextLength(1500000) // { short: "1.5M", long: "1.5M tokens" }
 */
export function formatContextLength(
  contextLength?: number
): { short: string; long: string } | null {
  if (!contextLength) {
    return null;
  }

  if (contextLength >= 1000000) {
    const value = contextLength / 1000000;
    const formatted = value.toFixed(1).replace(/\.0$/, "");
    return {
      short: `${formatted}M`,
      long: `${formatted}M tokens`,
    };
  }

  const formatted = (contextLength / 1000).toFixed(0);
  return {
    short: `${formatted}K`,
    long: `${formatted}K tokens`,
  };
}
