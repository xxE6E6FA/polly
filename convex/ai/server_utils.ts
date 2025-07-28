/**
 * Server-side utilities for Convex backend
 * Enhanced text processing, OpenRouter features, and performance monitoring
 */
import { humanizeString } from "humanize-ai-lib";

export const humanizeText = (text: string): string => {
  const result = humanizeString(text, {
    transformHidden: true,
    transformTrailingWhitespace: true,
    transformNbs: true,
    transformDashes: true,
    transformQuotes: true,
    transformOther: true,
    keyboardOnly: false,
  });
  return result.count > 0 ? result.text : text;
};

export const applyOpenRouterSorting = (
  modelId: string,
  sorting: "default" | "price" | "throughput" | "latency"
): string => {
  if (sorting === "default") {
    return modelId;
  }

  // Remove any existing shortcuts
  const cleanModelId = modelId.replace(/:nitro$|:floor$/g, "");

  // Apply new shortcut
  const sortingMap = {
    price: ":floor",
    throughput: ":nitro",
    latency: "",
  };

  return `${cleanModelId}${sortingMap[sorting] || ""}`;
};

type StreamingMetrics = {
  messageId: string;
  startTime: number;
  lastUpdateTime: number;
  chunkCount: number;
  totalCharacters: number;
  updateCount: number;
  batchSizes: number[];
};



const MIN_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 50;
const MIN_UPDATE_INTERVAL = 50; // ms
const MAX_UPDATE_INTERVAL = 200; // ms

export const calculateOptimalBatchSize = (
  contentLength: number,
  averageChunkSize: number,
  streamingVelocity: number // chars per second
): number => {
  // Base calculation on content characteristics
  let batchSize = Math.max(
    MIN_BATCH_SIZE,
    Math.min(
      MAX_BATCH_SIZE,
      Math.floor(streamingVelocity / 10) // Aim for ~10 updates per second at current velocity
    )
  );

  // Adjust for content length - larger content can handle bigger batches
  if (contentLength > 1000) {
    batchSize = Math.min(MAX_BATCH_SIZE, batchSize * 1.5);
  }

  // Adjust for chunk size - if chunks are naturally large, use smaller batches
  if (averageChunkSize > 20) {
    batchSize = Math.max(MIN_BATCH_SIZE, batchSize * 0.7);
  }

  return Math.round(batchSize);
};

export const calculateOptimalUpdateInterval = (
  contentLength: number,
  streamingVelocity: number
): number => {
  // Base interval on streaming velocity
  let interval = Math.max(
    MIN_UPDATE_INTERVAL,
    Math.min(
      MAX_UPDATE_INTERVAL,
      1000 / Math.max(streamingVelocity / 50, 5) // Target reasonable update frequency
    )
  );

  // Longer content can tolerate longer intervals
  if (contentLength > 2000) {
    interval = Math.min(MAX_UPDATE_INTERVAL, interval * 1.3);
  }

  return Math.round(interval);
};

type AdaptiveBatchingState = {
  chunkBuffer: string[];
  lastFlushTime: number;
  metrics: StreamingMetrics;
  batchSize: number;
  updateInterval: number;
  lastChunkHash: string | null;
};

export const createAdaptiveBatchingState = (
  messageId: string,
  initialBatchSize = 10,
  initialUpdateInterval = 100
): AdaptiveBatchingState => ({
  chunkBuffer: [],
  lastFlushTime: Date.now(),
  metrics: {
    messageId,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    chunkCount: 0,
    totalCharacters: 0,
    updateCount: 0,
    batchSizes: [],
  },
  batchSize: initialBatchSize,
  updateInterval: initialUpdateInterval,
  lastChunkHash: null,
});

export const addChunk = (
  state: AdaptiveBatchingState,
  chunk: string
): { state: AdaptiveBatchingState; shouldFlush: boolean; content?: string } => {
  // Simple hash to detect duplicate chunks
  const chunkHash =
    chunk.length + chunk.substring(0, Math.min(50, chunk.length));

  // Skip if this is a duplicate of the last chunk
  if (state.lastChunkHash === chunkHash) {
    console.warn(
      `[AdaptiveBatching] Duplicate chunk detected, skipping: "${chunk.substring(
        0,
        50
      )}..."`
    );
    return { state, shouldFlush: false };
  }

  const newState = {
    ...state,
    lastChunkHash: chunkHash,
    chunkBuffer: [...state.chunkBuffer, chunk],
    metrics: {
      ...state.metrics,
      chunkCount: state.metrics.chunkCount + 1,
      totalCharacters: state.metrics.totalCharacters + chunk.length,
      batchSizes: [...state.metrics.batchSizes, chunk.length],
    },
  };

  const now = Date.now();
  const timeSinceLastFlush = now - state.lastFlushTime;
  const bufferContent = newState.chunkBuffer.join("");

  // Adaptive flushing logic
  const shouldFlush =
    newState.chunkBuffer.length >= newState.batchSize ||
    timeSinceLastFlush >= newState.updateInterval ||
    (bufferContent.length > 0 && timeSinceLastFlush > 50); // Minimum responsiveness

  if (shouldFlush) {
    const content = bufferContent;
    const flushedState = {
      ...newState,
      chunkBuffer: [],
      lastFlushTime: now,
      metrics: {
        ...newState.metrics,
        updateCount: newState.metrics.updateCount + 1,
        lastUpdateTime: now,
      },
    };

    // Adaptive optimization
    const optimizedState = optimizeBatching(flushedState);

    return { state: optimizedState, shouldFlush: true, content };
  }

  return { state: newState, shouldFlush: false };
};

export const flushBuffer = (
  state: AdaptiveBatchingState
): { state: AdaptiveBatchingState; content: string } => {
  const content = state.chunkBuffer.join("");
  if (content.length > 0) {
    return {
      state: {
        ...state,
        chunkBuffer: [],
        lastFlushTime: Date.now(),
        metrics: {
      ...state.metrics,
      updateCount: state.metrics.updateCount + 1,
      lastUpdateTime: Date.now(),
    },
      },
      content,
    };
  }
  return { state, content };
};

const optimizeBatching = (
  state: AdaptiveBatchingState
): AdaptiveBatchingState => {
  const totalTime = Date.now() - state.metrics.startTime;

  // Optimize batch size based on performance
  if (totalTime > 1000) {
    // Only optimize after initial period
    const averageChunkSize = state.metrics.totalCharacters / Math.max(state.metrics.chunkCount, 1);
    const charactersPerSecond = state.metrics.totalCharacters / Math.max(totalTime / 1000, 0.1);
    
    return {
      ...state,
      batchSize: calculateOptimalBatchSize(
        state.metrics.totalCharacters,
        averageChunkSize,
        charactersPerSecond
      ),
      updateInterval: calculateOptimalUpdateInterval(
        state.metrics.totalCharacters,
        charactersPerSecond
      ),
    };
  }

  return state;
};

export const finalizeBatching = (state: AdaptiveBatchingState): void => {
  const totalTime = Date.now() - state.metrics.startTime;
  const averageChunkSize = state.metrics.totalCharacters / Math.max(state.metrics.chunkCount, 1);
  const charactersPerSecond = state.metrics.totalCharacters / Math.max(totalTime / 1000, 0.1);
  const updatesPerSecond = state.metrics.updateCount / Math.max(totalTime / 1000, 0.1);
  const efficiency = state.metrics.totalCharacters / Math.max(state.metrics.updateCount, 1);

  const computed = {
    messageId: state.metrics.messageId,
    totalTime,
    chunkCount: state.metrics.chunkCount,
    updateCount: state.metrics.updateCount,
    totalCharacters: state.metrics.totalCharacters,
    averageChunkSize: Math.round(averageChunkSize * 100) / 100,
    charactersPerSecond: Math.round(charactersPerSecond * 100) / 100,
    updatesPerSecond: Math.round(updatesPerSecond * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
  };

  console.log(`[StreamPerf:${state.metrics.messageId}] Final metrics:`, computed);

  if (computed.efficiency < 10) {
    console.warn(
      `[StreamPerf:${state.metrics.messageId}] Low efficiency detected: ${computed.efficiency} chars/update. Consider increasing batch size.`
    );
  }

  if (computed.updatesPerSecond > 20) {
    console.warn(
      `[StreamPerf:${state.metrics.messageId}] High update frequency: ${computed.updatesPerSecond}/sec. Consider throttling.`
    );
  }
};
