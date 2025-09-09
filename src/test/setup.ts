// Test setup for Vitest + React Testing Library
import "@testing-library/jest-dom";

// Swallow Vitest worker shutdown errors in sandboxed environments (Mac seatbelt)
// These appear as unhandled rejections with code EPERM when killing workers.
process.on("unhandledRejection", err => {
  try {
    const e = err as { code?: string; syscall?: string };
    if (e && e.code === "EPERM" && e.syscall === "kill") {
      // Ignore harmless worker termination failures
      return;
    }
  } catch {
    // Ignore other errors
  }
  throw err;
});
