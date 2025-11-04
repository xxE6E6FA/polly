/** Utilities for safely using the Convex scheduler in environments like tests. */

type SchedulerLike = {
  scheduler?: {
    runAfter: (delay: number, fn: any, args?: any) => Promise<any>;
  };
};

function schedulerDisabled(): boolean {
  if (process.env.CONVEX_ENABLE_SCHEDULER_IN_TEST === "true") {
    return false;
  }
  if (process.env.CONVEX_DISABLE_SCHEDULER === "true") {
    return true;
  }
  return process.env.NODE_ENV === "test";
}

export function isSchedulerEnabled(): boolean {
  return !schedulerDisabled();
}

export async function scheduleRunAfter(
  ctx: SchedulerLike,
  delayMs: number,
  fn: any,
  args?: any
) {
  if (!isSchedulerEnabled()) {
    return;
  }
  const scheduler = ctx.scheduler;
  if (!scheduler?.runAfter) {
    return;
  }
  return scheduler.runAfter(delayMs, fn, args);
}
