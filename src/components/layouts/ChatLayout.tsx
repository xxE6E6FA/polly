import { Outlet } from "react-router";

import { SharedChatLayout } from "@/components/shared-chat-layout";

export default function ChatLayout() {
  return (
    <SharedChatLayout>
      <Outlet />
    </SharedChatLayout>
  );
}
