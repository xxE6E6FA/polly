import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearUserData } from "@/lib/local-storage";
import { resetChatInputStoreApi } from "@/stores/chat-input-store";

export default function SignOutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    try {
      // Clear user data from local storage before signing out
      clearUserData();
      // Reset the chat input store to clear cached selected model
      resetChatInputStoreApi();
      await signOut();
    } catch (_error) {
      // Sign out failed, but we'll navigate anyway
    } finally {
      navigate("/", { replace: true });
    }
  }, [signOut, navigate]);

  useEffect(() => {
    handleSignOut();
  }, [handleSignOut]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mx-auto" />
        </div>
        <p className="text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}
