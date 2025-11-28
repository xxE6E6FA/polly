import type { LoaderFunctionArgs } from "react-router-dom";

export type ConversationLoaderResult = {
  slug: string;
};

export function conversationLoader({ params }: LoaderFunctionArgs) {
  const slug = params.conversationId;
  if (!slug) {
    throw new Response("Conversation not found", { status: 404 });
  }

  return { slug } satisfies ConversationLoaderResult;
}
