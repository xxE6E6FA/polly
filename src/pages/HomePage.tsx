import { useEffect } from "react";
import { ChatZeroState } from "@/components/chat-zero-state";
import { SharedChatLayout } from "@/components/shared-chat-layout";
import { PrivateToggle } from "@/components/private-toggle";
import { usePrivateMode } from "@/contexts/private-mode-context";

export default function HomePage() {
  const { setPrivateMode } = usePrivateMode();

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  return (
    <SharedChatLayout>
      <PrivateToggle />
      <ChatZeroState />
    </SharedChatLayout>
  );
}
