/**
 * Production-safe logging utility for Convex
 * 
 * Provides different log levels and controls verbosity based on environment.
 * In production, only logs warnings and errors to reduce noise and improve performance.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

class ConvexLogger {
  private isDevelopment(): boolean {
    // Check if we're in development mode
    // Convex doesn't have NODE_ENV, so we check for development indicators
    try {
      // In development, the deployment URL typically contains "convex.dev" or is localhost
      // In production, it would be a custom domain or production Convex deployment
      const deploymentUrl = process.env.CONVEX_CLOUD_URL || "";
      return deploymentUrl.includes("convex.dev") || deploymentUrl.includes("localhost");
    } catch {
      return false; // Default to production if we can't determine
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment()) {
      return true; // Log everything in development
    }
    
    // In production, only log warnings and errors
    return level === "warn" || level === "error";
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  // Stream-specific logging methods with better categorization
  streamStart(modelId: string, provider: string, messageId: string): void {
    this.debug(`Stream starting: ${modelId}/${provider} - ${messageId.slice(-8)}`);
  }

  streamReasoning(messageId: string, reasoningText: string): void {
    this.debug(`Reasoning ${messageId.slice(-8)}: ${reasoningText.substring(0, 60)}...`);
  }

  streamComplete(messageId: string, chunkCount: number, charCount: number): void {
    this.info(`Stream complete: ${messageId.slice(-8)} - ${chunkCount} chunks, ${charCount} chars`);
  }

  streamError(message: string, error?: any): void {
    this.error(`Stream error: ${message}`, error);
  }

  streamAbort(message: string): void {
    this.warn(`Stream aborted: ${message}`);
  }
}

// Export a singleton instance
export const logger = new ConvexLogger();

// For backward compatibility, export individual functions
export const log = {
  debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
  info: (message: string, ...args: any[]) => logger.info(message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn(message, ...args),
  error: (message: string, ...args: any[]) => logger.error(message, ...args),
  
  // Stream-specific methods
  streamStart: (modelId: string, provider: string, messageId: string) => 
    logger.streamStart(modelId, provider, messageId),
  streamReasoning: (messageId: string, reasoningText: string) => 
    logger.streamReasoning(messageId, reasoningText),
  streamComplete: (messageId: string, chunkCount: number, charCount: number) => 
    logger.streamComplete(messageId, chunkCount, charCount),
  streamError: (message: string, error?: any) => logger.streamError(message, error),
  streamAbort: (message: string) => logger.streamAbort(message),
};
