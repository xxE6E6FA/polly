/**
 * Centralized resource management for streaming operations
 */

export class ResourceManager {
  private resources: Array<() => void> = [];
  private isCleaningUp = false;

  /**
   * Register a cleanup function
   */
  register(cleanup: () => void): void {
    if (!this.isCleaningUp) {
      this.resources.push(cleanup);
    }
  }

  /**
   * Register an interval for cleanup
   */
  registerInterval(intervalId: NodeJS.Timeout): void {
    this.register(() => clearInterval(intervalId));
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeoutId: NodeJS.Timeout): void {
    this.register(() => clearTimeout(timeoutId));
  }

  /**
   * Register an abort controller for cleanup
   */
  registerAbortController(controller: AbortController): void {
    this.register(() => {
      if (!controller.signal.aborted) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors during cleanup
        }
      }
    });
  }

  /**
   * Clean up all registered resources
   */
  cleanup(): void {
    if (this.isCleaningUp) return;

    this.isCleaningUp = true;

    for (const cleanup of this.resources) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    this.resources = [];
  }

  /**
   * Execute a function with automatic cleanup on completion/error
   */
  async withCleanup<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } finally {
      this.cleanup();
    }
  }
}
