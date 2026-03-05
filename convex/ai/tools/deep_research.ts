import { tool } from "ai";
import { z } from "zod/v3";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { performDeepResearch, type ResearchModel } from "../exa_research";
import type { Citation } from "../../types";

/**
 * Result returned from the deep research tool.
 */
export interface DeepResearchToolResult {
  success: boolean;
  content: string;
  citations: Citation[];
  researchId?: string;
  instructions: string;
  model: string;
  error?: string;
}

export const deepResearchToolSchema = z.object({
  instructions: z
    .string()
    .describe(
      "Detailed instructions about what to research. Be specific about what information to find, sources to prioritize, and how to structure the output."
    ),
  model: z
    .enum(["exa-research-fast", "exa-research", "exa-research-pro"])
    .optional()
    .default("exa-research")
    .describe(
      "Research model: 'exa-research-fast' for quick research, 'exa-research' (default) for balanced, 'exa-research-pro' for thorough analysis"
    ),
});

export type DeepResearchToolParams = z.infer<typeof deepResearchToolSchema>;

/**
 * Creates the deep research tool for AI SDK streamText.
 * Requires Exa API key and Convex context for progress updates.
 */
export function createDeepResearchTool(
  exaApiKey: string,
  ctx: ActionCtx,
  messageId: Id<"messages">,
  abortSignal?: AbortSignal,
) {
  return tool({
    description: `Perform deep, multi-source research on a topic. This tool uses an AI research agent that plans queries, searches in parallel, reads pages, and synthesizes findings.

Use this tool when the user has requested deep research. This is for comprehensive, multi-source synthesis ONLY. It takes 30-90 seconds.

You MUST call this tool with detailed instructions about what to research.`,
    inputSchema: deepResearchToolSchema,
    execute: async ({ instructions, model }): Promise<DeepResearchToolResult> => {
      try {
        // Update progress as research proceeds
        const onProgress = async (progress: { stage: string; detail: string }) => {
          try {
            await ctx.runMutation(internal.messages.updateToolCallProgress, {
              messageId,
              toolName: "deepResearch",
              progress: {
                stage: progress.stage,
                detail: progress.detail,
              },
            });
          } catch {
            // Progress updates are best-effort
          }
        };

        const result = await performDeepResearch(
          exaApiKey,
          { instructions, model: model as ResearchModel },
          onProgress,
          abortSignal,
        );

        return {
          success: true,
          content: result.content,
          citations: result.citations,
          researchId: result.researchId,
          instructions,
          model: model || "exa-research",
        };
      } catch (error) {
        return {
          success: false,
          content: "",
          citations: [],
          instructions,
          model: model || "exa-research",
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    },
  });
}

export const DEEP_RESEARCH_TOOL_NAME = "deepResearch" as const;
