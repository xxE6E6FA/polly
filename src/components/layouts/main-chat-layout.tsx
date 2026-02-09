import { Outlet, useLocation, useParams } from "react-router-dom";

import { SharedChatLayout } from "@/components/layouts/shared-chat-layout";

/**
 * Main chat layout that wraps SharedChatLayout and provides a stable
 * layout container for both the home page and conversation pages.
 * This prevents layout re-mounting when navigating between / and /chat/:id.
 */
export default function MainChatLayout() {
  const { conversationId } = useParams();
  const location = useLocation();
  // Use conversationId if available, otherwise use pathname for keying
  // This ensures the Outlet re-renders when navigating between conversations
  // but keeps SharedChatLayout stable
  const outletKey = conversationId ?? location.pathname;

  return (
    <SharedChatLayout>
      <div key={outletKey} className="h-full animate-page-enter">
        <Outlet />
      </div>
    </SharedChatLayout>
  );
}
