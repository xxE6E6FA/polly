import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { LoaderFunctionArgs } from "react-router-dom";
import { getConvexClient } from "@/providers/convex-provider";

type ConversationLoaderResult = {
  conversationAccessInfo: unknown;
  messages: unknown;
  lastUsedModel: unknown;
  streamingStatus: unknown;
};

export async function conversationLoader({ params }: LoaderFunctionArgs) {
  const { conversationId } = params;
  if (!conversationId) {
    throw new Response("Conversation not found", { status: 404 });
  }

  const client = getConvexClient();
  const id = conversationId as Id<"conversations">;

  const conversationAccessInfo = client.query(
    api.conversations.getWithAccessInfo,
    {
      id,
    }
  );
  const messages = client.query(api.messages.list, {
    conversationId: id,
  });
  const lastUsedModel = client.query(api.messages.getLastUsedModel, {
    conversationId: id,
  });
  const streamingStatus = client.query(api.conversations.isStreaming, {
    conversationId: id,
  });

  const [
    conversationAccessInfoResult,
    messagesResult,
    lastUsedModelResult,
    streamingStatusResult,
  ] = await Promise.all([
    conversationAccessInfo,
    messages,
    lastUsedModel,
    streamingStatus,
  ]);

  return {
    conversationAccessInfo: conversationAccessInfoResult,
    messages: messagesResult,
    lastUsedModel: lastUsedModelResult,
    streamingStatus: streamingStatusResult,
  } satisfies ConversationLoaderResult;
}

export type { ConversationLoaderResult };
