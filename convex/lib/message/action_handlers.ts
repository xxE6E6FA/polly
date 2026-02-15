import { streamText } from "ai";
import dedent from "dedent";
import { createSmoothStreamTransform } from "../../../shared/streaming-utils";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { getApiKey } from "../../ai/encryption";
import { createLanguageModel } from "../../ai/server_streaming";
import {
  getPersonaPrompt,
} from "../conversation_utils";

export async function refineAssistantMessageHandler(
  ctx: ActionCtx,
  args: {
    messageId: Id<"messages">;
    mode: "custom" | "more_concise" | "add_details";
    instruction?: string;
  }
) {
  // Load original assistant message
  const message = await ctx.runQuery(api.messages.getById, {
    id: args.messageId,
  });
  if (!message || message.role !== "assistant") {
    throw new Error("Assistant message not found");
  }
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: message.conversationId,
  });
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  // Find last used model/provider on this conversation
  const last = await ctx.runQuery(api.messages.getLastAssistantModel, {
    conversationId: message.conversationId,
  });
  const modelId = last?.modelId;
  const provider = last?.provider as
    | "openai"
    | "anthropic"
    | "google"
    | "openrouter"
    | "replicate"
    | undefined;
  if (!(modelId && provider)) {
    throw new Error("No model context available to refine");
  }
  const apiKey = await getApiKey(ctx, provider, modelId, conversation._id);
  if (!apiKey) {
    throw new Error("Missing API key for provider");
  }
  const model = await createLanguageModel(
    ctx,
    provider as "openai" | "anthropic" | "google" | "openrouter",
    modelId,
    apiKey
  );

  // Gather persona context if available
  const personaPrompt = await getPersonaPrompt(ctx, conversation.personaId);

  // Get the previous user message (if any) for additional context
  const convoMessages = await ctx.runQuery(
    api.messages.getAllInConversation,
    {
      conversationId: message.conversationId,
    }
  );
  type MessageRow = { _id: Id<"messages">; role: string; content: string };
  const convoArray: MessageRow[] = convoMessages as MessageRow[];
  const targetIndex = convoArray.findIndex(
    (m: MessageRow) => m._id === args.messageId
  );
  let previousUserContent: string | undefined;
  for (let i = targetIndex - 1; i >= 0; i--) {
    const m = convoArray[i];
    if (!m) {
      continue;
    }
    if (m.role === "user") {
      previousUserContent =
        typeof m.content === "string" ? m.content : undefined;
      break;
    }
  }

  let targetTemperature = 0.3;

  const modeInstruction = (() => {
    if (args.mode === "custom") {
      return dedent`
          Apply the user's instruction below to refine the assistant's response.
          - Do not change the intent, stance, or technical correctness of the message.
          - Preserve all important facts, steps, numbers, variable names, links, and any citations in square brackets like [1], [2].
          - Preserve Markdown structure and code fences exactly. Do not modify code or JSON content.
          - Keep exact terminology (proper nouns, API names, config keys). Do not substitute synonyms that change nuance.
          - Maintain ordering of steps and list items unless grouping improves clarity without changing meaning.
          - Only rewrite the text; do not add new sections that change scope or introduce unverified facts or new claims.
          - If a tradeoff arises between following the instruction and preserving meaning, preserve meaning.
          - Return only the rewritten response.

          User instruction: ${args.instruction || "(none)"}
        `;
    }
    if (args.mode === "more_concise") {
      targetTemperature = 0.15;
      return dedent`
              Rewrite the assistant's response to be substantially more concise while strictly preserving meaning.
              Fidelity constraints (must hold):
              - Keep all claims, caveats, requirements, and conclusions unchanged.
              - Preserve all numbers, units, parameter names, variable names, links, and citations [n].
              - Preserve Markdown structure, headings, list order, and code/JSON blocks exactly (do not edit code or JSON).
              - Maintain modality and tone (e.g., "must", "should", "may").
              Concision guidance:
              - Target ~40–50% reduction in length.
              - Remove filler, hedging, repeated ideas, and verbose preludes/outros.
              - Prefer compact sentences and bullets when it improves clarity.
              - Keep terminology consistent; avoid synonyms that shift nuance.
              - End at a natural stopping point; never cut off a sentence or list item. If needed, shorten further to end cleanly.
              If any conflict arises, prioritize fidelity over brevity.
              Return only the rewritten response.
            `;
    }
    return dedent`
            Expand the assistant's response with helpful clarifications while strictly preserving meaning.
            Fidelity constraints (must hold):
            - Keep all original claims, numbers, constraints, and conclusions unchanged.
            - Do not introduce new facts, sources, or citations beyond what is already present.
            - Preserve Markdown structure, headings, list order, and code/JSON blocks exactly (do not edit code or JSON).
            - Maintain modality and tone.
            Expansion guidance:
            - Target ~40–60% increase in length with focused clarifications.
            - Add brief examples, short definitions, or one-sentence rationale that are generic and consistent with the original.
            - Prefer adding parentheticals or short follow-up sentences rather than new sections.
            - Keep terminology consistent; avoid synonyms that shift nuance.
            - End at a natural stopping point; never cut off a sentence or list item.
            If any conflict arises, prioritize fidelity over expansion.
            Return only the rewritten response.
          `;
  })();

  const basePrompt = dedent`
    You will refine an assistant's previous response.
    ${personaPrompt ? `\nPersona context (for style and priorities):\n"""\n${personaPrompt}\n"""\n` : ""}
    ${previousUserContent ? `Original user message (for context, do not answer anew):\n"""\n${previousUserContent}\n"""\n` : ""}

    Assistant response to rewrite:
    """
    ${message.content}
    """

    ${modeInstruction}
  `;

  // Prepare stream state like normal retry: delete this assistant message and
  // everything after it (except context), then create a fresh assistant message
  // with thinking status and mark conversation streaming
  const originalContent = message.content || "";
  // (Content already set to placeholder above)

  try {
    // Delete the current assistant message and subsequent messages (preserve context)
    // Reuse convoMessages from earlier to avoid redundant query
    const currentIndex = convoArray.findIndex(m => m._id === args.messageId);
    if (currentIndex >= 0) {
      for (const msg of convoArray.slice(currentIndex)) {
        if (msg.role === "context") {
          continue;
        }
        await ctx.runMutation(api.messages.remove, { id: msg._id });
      }
    }

    // Create new assistant placeholder (thinking)
    const newAssistantId = await ctx.runMutation(api.messages.create, {
      conversationId: message.conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      model: modelId,
      provider,
    });
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: conversation._id,
      updates: { isStreaming: true },
    });

    const baseOptions = {
      model,
      prompt: basePrompt,
      temperature: targetTemperature,
      experimental_transform: createSmoothStreamTransform(),
    } as const;
    const result = streamText(baseOptions);

    let receivedAny = false;
    let fullContent = "";
    for await (const chunk of result.textStream) {
      receivedAny = true;
      fullContent += chunk;
      await ctx.runMutation(internal.messages.updateAssistantContent, {
        messageId: newAssistantId,
        appendContent: chunk,
      });
    }

    if (receivedAny) {
      // Finalize message content and mark finishReason so UI knows stream is complete
      await ctx.runMutation(internal.messages.updateContent, {
        messageId: newAssistantId,
        content: fullContent,
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
      await ctx.runMutation(internal.messages.updateAssistantStatus, {
        messageId: newAssistantId,
        status: "done",
      });
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: conversation._id,
        updates: { isStreaming: false },
      });
    } else {
      // No content returned: set a helpful error message and mark as error
      const errorMessage =
        "The AI provider returned no content. Please try again or rephrase your request.";
      await ctx.runMutation(internal.messages.updateContent, {
        messageId: newAssistantId,
        content: errorMessage,
        finishReason: "error",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
      await ctx.runMutation(internal.messages.updateAssistantStatus, {
        messageId: newAssistantId,
        status: "error",
      });
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: conversation._id,
        updates: { isStreaming: false },
      });
    }

    return { success: true } as const;
  } catch (error) {
    // On failure, create an error assistant message with original content to avoid blank UI
    await ctx.runMutation(api.messages.create, {
      conversationId: message.conversationId,
      role: "assistant",
      content: originalContent,
      status: "error",
      model: modelId,
      provider,
    });
    await ctx.runMutation(internal.messages.updateAssistantStatus, {
      messageId: args.messageId,
      status: "error",
      statusText: error instanceof Error ? error.message : "Refine failed",
    });
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: conversation._id,
      updates: { isStreaming: false },
    });
    throw error;
  }
}
