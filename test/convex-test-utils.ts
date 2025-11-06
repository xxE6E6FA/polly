type ConvexTestFactory = () => any;

const shouldSkip = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = (error as { message?: string }).message ?? "";
  return message.includes("import.meta.glob") || message.includes("not a function");
};

export async function loadConvexTest(): Promise<ConvexTestFactory | null> {
  let factory: unknown;
  try {
    const mod = await import("convex-test");
    factory = (mod as any).convexTest ?? (mod as any).default ?? (mod as any).ConvexTest;
  } catch (error) {
    if (shouldSkip(error)) {
      return null;
    }
    console.warn("convex-test unavailable; skipping Convex specs", error);
    return null;
  }

  if (typeof factory !== "function") {
    console.warn("convex-test module found but no convexTest() export; skipping");
    return null;
  }

  try {
    return (factory as ConvexTestFactory);
  } catch (error) {
    if (shouldSkip(error)) {
      return null;
    }
    throw error;
  }
}

export async function createConvexTestInstance() {
  const factory = await loadConvexTest();
  if (!factory) {
    return null;
  }
  try {
    return factory();
  } catch (error) {
    if (shouldSkip(error)) {
      return null;
    }
    throw error;
  }
}

