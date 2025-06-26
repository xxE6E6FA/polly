import { ChatZeroState } from "@/components/chat-zero-state";
import { SharedChatLayout } from "@/components/shared-chat-layout";

export default function HomePage() {
  return (
    <SharedChatLayout>
      <ChatZeroState />
    </SharedChatLayout>
  );
}
