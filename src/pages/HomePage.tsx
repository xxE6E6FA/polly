import { useEffect } from "react";
import { ChatZeroState } from "@/components/chat-zero-state";
import { SharedChatLayout } from "@/components/shared-chat-layout";
import { usePrivateMode } from "@/contexts/private-mode-context";

export default function HomePage() {
  const { setPrivateMode } = usePrivateMode();

  // Ensure we're not in private mode on the home page
  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  return (
    <SharedChatLayout>
      <ChatZeroState />
    </SharedChatLayout>
  );
}
