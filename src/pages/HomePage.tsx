import { useEffect } from "react";
import { ChatZeroState } from "@/components/chat-zero-state";
import { PrivateToggle } from "@/components/private-toggle";
import { SharedChatLayout } from "@/components/shared-chat-layout";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";

export default function HomePage() {
  const { setPrivateMode } = usePrivateMode();
  const { user } = useUserDataContext();

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  return (
    <SharedChatLayout>
      {user && !user.isAnonymous && <PrivateToggle />}
      <ChatZeroState />
    </SharedChatLayout>
  );
}
