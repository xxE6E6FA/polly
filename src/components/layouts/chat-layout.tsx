import { Outlet, useLocation, useParams } from "react-router-dom";

import { SharedChatLayout } from "@/components/layouts/shared-chat-layout";

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
