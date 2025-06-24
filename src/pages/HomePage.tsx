import { SharedChatLayout } from "@/components/shared-chat-layout";
import { ChatZeroState } from "@/components/chat-zero-state";

export default function HomePage() {
  return (
    <SharedChatLayout>
      <ChatZeroState />
    </SharedChatLayout>
  );
}
