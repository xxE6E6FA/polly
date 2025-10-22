import { Outlet, useLocation, useParams } from "react-router";

import { SharedChatLayout } from "@/components/shared-chat-layout";

export default function ChatLayout() {
  const { conversationId } = useParams();
  const location = useLocation();
  const outletKey = conversationId ?? location.pathname;

  return (
    <SharedChatLayout>
      <Outlet key={outletKey} />
    </SharedChatLayout>
  );
}
