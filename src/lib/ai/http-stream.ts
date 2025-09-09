import type { Id } from "@convex/_generated/dataModel";
import { useStreamOverlays } from "@/stores/stream-overlays";

export type StartAuthorStreamArgs = {
  convexUrl: string;
  authToken?: string | null;
  conversationId: Id<"conversations"> | string;
  assistantMessageId: Id<"messages"> | string;
  // Optional extras; server can infer when omitted
  modelId?: string;
  provider?: string;
  personaId?: Id<"personas"> | null;
  reasoningConfig?: unknown;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  // Optional callback when the server signals finish ("stop" | "error")
  onFinish?: (reason: string) => void;
};

export type StartStreamHandle = {
  abortController: AbortController;
};

export async function startAuthorStream(
  args: StartAuthorStreamArgs
): Promise<StartStreamHandle | null> {
  const {
    convexUrl,
    authToken,
    conversationId,
    assistantMessageId,
    modelId,
    provider,
    personaId,
    reasoningConfig,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
  } = args;

  const url = `${convexUrl}/http/conversation/stream`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Authorization header is optional now; cookie-based auth is supported via credentials: 'include'
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const body: Record<string, unknown> = {
    conversationId,
    messageId: assistantMessageId,
  };
  if (modelId) {
    body.modelId = modelId;
  }
  if (provider) {
    body.provider = provider;
  }
  if (personaId != null) {
    body.personaId = personaId;
  }
  if (reasoningConfig) {
    body.reasoningConfig = reasoningConfig;
  }
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  if (maxTokens !== undefined) {
    body.maxTokens = maxTokens;
  }
  if (topP !== undefined) {
    body.topP = topP;
  }
  if (frequencyPenalty !== undefined) {
    body.frequencyPenalty = frequencyPenalty;
  }
  if (presencePenalty !== undefined) {
    body.presencePenalty = presencePenalty;
  }

  const abortController = new AbortController();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      signal: abortController.signal,
    });

    // Validate response before proceeding; fall back if not OK or wrong content type
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unable to read response");
      console.error(`HTTP stream failed with status ${res.status}:`, errorText);

      // Handle specific error cases
      if (res.status === 429) {
        console.warn("Rate limit exceeded - falling back to Convex streaming");
      } else if (res.status === 401) {
        console.warn("Authentication failed - check auth token");
      }

      return null;
    }
    if (!contentType.includes("application/x-ndjson")) {
      console.error(`Unexpected content type: ${contentType}`);
      return null;
    }

    const stream = res.body;
    if (!stream) {
      return { abortController };
    }

    const overlays = useStreamOverlays.getState();
    const id = String(assistantMessageId);
    overlays.set(id, "");
    overlays.setReasoning(id, "");
    overlays.setStatus(id, "thinking");

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let didFinish = false;
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }
          buffer += decoder.decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line) {
              continue;
            }
            try {
              const evt = JSON.parse(line) as {
                t: string;
                d?: string;
                reason?: string;
                status?: string;
                citations?: Array<{ url: string; title?: string }>;
                name?: string;
                args?: unknown;
                ok?: boolean;
                count?: number;
              };
              if (evt.t === "content" && evt.d) {
                overlays.append(id, evt.d);
              } else if (evt.t === "reasoning" && evt.d) {
                overlays.appendReasoning(id, evt.d);
              } else if (evt.t === "status" && evt.status) {
                overlays.setStatus(id, evt.status);
              } else if (evt.t === "citations" && evt.citations) {
                overlays.setCitations(id, evt.citations);
              } else if (evt.t === "tool_call" && evt.name) {
                overlays.pushToolEvent(id, {
                  t: "tool_call",
                  name: evt.name,
                  args: evt.args,
                });
              } else if (evt.t === "tool_result" && evt.name) {
                overlays.pushToolEvent(id, {
                  t: "tool_result",
                  name: evt.name,
                  ok: evt.ok,
                  count: evt.count,
                });
              } else if (evt.t === "finish") {
                didFinish = true;
                // Inform caller that the stream is finished
                try {
                  args.onFinish?.(evt.reason || "stop");
                } catch {
                  // ignore callback errors
                }
                // Delay overlay clearing slightly to allow DB updates to propagate
                setTimeout(() => {
                  overlays.clear(id);
                  overlays.clearReasoning(id);
                  overlays.clearStatus(id);
                  overlays.clearCitations(id);
                  overlays.clearTools(id);
                }, 250);
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      } catch {
        // Swallow read errors (abort, network)
      } finally {
        // If the stream ended without an explicit finish event (abort/error),
        // clear overlays to avoid stale UI
        if (!didFinish) {
          overlays.clear(String(assistantMessageId));
          overlays.clearReasoning(String(assistantMessageId));
          overlays.clearStatus(String(assistantMessageId));
          overlays.clearCitations(String(assistantMessageId));
          overlays.clearTools(String(assistantMessageId));
        }
      }
    })();
    return { abortController };
  } catch {
    return null;
  }
}
