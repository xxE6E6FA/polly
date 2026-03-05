/**
 * Exa Research API wrapper
 *
 * Uses the Exa Research API (/research/v1) to perform deep, agentic research.
 * Creates a research request, polls until finished, and extracts citations from events.
 */
import Exa, { type Research, type ResearchEvent } from "exa-js";
import { exaResultsToCitations } from "./exa";
import type { Citation } from "../types";

/** Flattened view of Research with events always accessible */
type ResearchWithEvents = Research & { events?: ResearchEvent[] };

export type ResearchModel =
  | "exa-research-fast"
  | "exa-research"
  | "exa-research-pro";

export type ResearchProgress = {
  stage: string;
  detail: string;
};

export type ResearchResult = {
  content: string;
  citations: Citation[];
  researchId: string;
  costDollars?: number;
};

type OnProgress = (progress: ResearchProgress) => void | Promise<void>;

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 300_000; // 5 minutes

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Research aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Research aborted"));
      },
      { once: true },
    );
  });
}

/**
 * Derive a human-readable progress update from a research event.
 */
function progressFromEvent(event: Record<string, unknown>): ResearchProgress | null {
  const eventType = event.eventType as string;
  const data = event.data as Record<string, unknown> | undefined;

  if (eventType === "plan-definition") {
    return { stage: "planning", detail: "Planning research strategy…" };
  }

  if (eventType === "plan-operation" && data) {
    const type = data.type as string;
    if (type === "think") {
      return { stage: "planning", detail: "Analyzing research approach…" };
    }
    if (type === "search") {
      const query = data.query as string | undefined;
      return {
        stage: "searching",
        detail: query ? `Searching: "${query.slice(0, 60)}"` : "Searching…",
      };
    }
    if (type === "crawl") {
      const result = data.result as { url?: string } | undefined;
      const host = result?.url ? new URL(result.url).hostname : undefined;
      return {
        stage: "reading",
        detail: host ? `Reading ${host}…` : "Reading page…",
      };
    }
  }

  if (eventType === "task-definition") {
    const instructions = event.instructions as string | undefined;
    return {
      stage: "researching",
      detail: instructions
        ? `Task: ${instructions.slice(0, 60)}${instructions.length > 60 ? "…" : ""}`
        : "Starting research task…",
    };
  }

  if (eventType === "task-operation" && data) {
    const type = data.type as string;
    if (type === "think") {
      return { stage: "analyzing", detail: "Analyzing findings…" };
    }
    if (type === "search") {
      const query = data.query as string | undefined;
      return {
        stage: "searching",
        detail: query ? `Searching: "${query.slice(0, 60)}"` : "Searching…",
      };
    }
    if (type === "crawl") {
      const result = data.result as { url?: string } | undefined;
      const host = result?.url ? new URL(result.url).hostname : undefined;
      return {
        stage: "reading",
        detail: host ? `Reading ${host}…` : "Reading page…",
      };
    }
  }

  if (eventType === "plan-output") {
    return { stage: "synthesizing", detail: "Synthesizing findings…" };
  }

  return null;
}

/**
 * Perform deep research using the Exa Research API.
 *
 * Creates a research request, manually polls with abort support,
 * fires progress callbacks from events, and extracts citations.
 *
 * @param apiKey - Exa API key
 * @param options.instructions - What to research
 * @param options.model - Research model (default: "exa-research")
 * @param onProgress - Optional callback for progress updates
 * @param signal - Optional abort signal for cancellation
 * @returns Research result with content, citations, and metadata
 */
export async function performDeepResearch(
  apiKey: string,
  options: {
    instructions: string;
    model?: ResearchModel;
  },
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<ResearchResult> {
  const exa = new Exa(apiKey);

  // Check abort before starting
  if (signal?.aborted) {
    throw new Error("Research aborted");
  }

  // Create the research request
  const created = await exa.research.create({
    instructions: options.instructions,
    model: options.model || "exa-research",
  });

  const researchId = created.researchId;
  console.log("[exa_research] Research created:", researchId);

  await onProgress?.({
    stage: "planning",
    detail: "Planning research queries…",
  });

  // Manual polling loop with abort support and progress tracking
  const deadline = Date.now() + TIMEOUT_MS;
  let lastSeenEventCount = 0;
  let result: ResearchWithEvents;

  while (true) {
    if (signal?.aborted) {
      throw new Error("Research aborted");
    }

    // Fetch current state with events
    result = (await exa.research.get(researchId, {
      stream: false,
      events: true,
    })) as ResearchWithEvents;

    // Process new events for progress updates
    if (result.events && result.events.length > lastSeenEventCount) {
      const newEvents = result.events.slice(lastSeenEventCount);
      lastSeenEventCount = result.events.length;

      // Report the latest meaningful event as progress
      for (const event of newEvents) {
        const progress = progressFromEvent(
          event as unknown as Record<string, unknown>,
        );
        if (progress) {
          await onProgress?.(progress);
        }
      }
    }

    // Check terminal states
    if (
      result.status === "completed" ||
      result.status === "failed" ||
      result.status === "canceled"
    ) {
      break;
    }

    if (Date.now() > deadline) {
      throw new Error("Research timed out");
    }

    // Wait before next poll, abort-aware
    await sleep(POLL_INTERVAL_MS, signal);
  }

  if (result.status === "failed") {
    throw new Error("Research failed");
  }

  if (result.status === "canceled") {
    throw new Error("Research was canceled");
  }

  // Extract content from research output
  const output = result.output as { text?: string } | undefined;
  const content = output?.text ?? "";

  // Extract citations from events — find search/crawl operation events with URLs
  const citations: Citation[] = [];
  if (result.events) {
    for (const event of result.events) {
      if (
        event.eventType === "task-operation" ||
        event.eventType === "plan-operation"
      ) {
        const ev = event as Record<string, unknown>;
        const data = ev.data as Record<string, unknown> | undefined;
        if (!data) continue;

        const type = data.type as string;
        if (type === "search" && Array.isArray(data.results)) {
          const eventCitations = exaResultsToCitations(
            (
              data.results as Array<{
                url: string;
                title?: string | null;
                text?: string;
              }>
            ).map((r) => ({
              url: r.url,
              title: r.title,
              text: r.text,
            })),
          );
          citations.push(...eventCitations);
        }
        if (type === "crawl") {
          const crawlResult = data.result as
            | { url: string; title?: string | null; text?: string }
            | undefined;
          if (crawlResult?.url) {
            const eventCitations = exaResultsToCitations([
              {
                url: crawlResult.url,
                title: crawlResult.title,
                text: crawlResult.text,
              },
            ]);
            citations.push(...eventCitations);
          }
        }
      }
    }
  }

  // Deduplicate citations by URL
  const seen = new Set<string>();
  const uniqueCitations = citations.filter((c) => {
    if (seen.has(c.url)) {
      return false;
    }
    seen.add(c.url);
    return true;
  });

  // Extract cost if available
  let costDollars: number | undefined;
  if (result.events) {
    for (const event of result.events) {
      if (event.eventType === "research-output") {
        const ev = event as Record<string, unknown>;
        const evOutput = ev.output as Record<string, unknown> | undefined;
        if (evOutput) {
          const costs = evOutput.costDollars as
            | { total?: number }
            | undefined;
          costDollars = costs?.total;
        }
      }
    }
  }

  console.log("[exa_research] Research completed:", {
    researchId,
    contentLength: content.length,
    citationCount: uniqueCitations.length,
    costDollars,
  });

  return {
    content,
    citations: uniqueCitations,
    researchId,
    costDollars,
  };
}
