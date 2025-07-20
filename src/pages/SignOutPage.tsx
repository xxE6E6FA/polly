import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { clearUserData } from "@/lib/local-storage";

export default function SignOutPage() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    try {
      // Clear user data from local storage before signing out
      clearUserData();
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      navigate("/", { replace: true });
    }
  }, [signOut, navigate]);

  useEffect(() => {
    handleSignOut();
  }, [handleSignOut]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mx-auto" />
        </div>
        <p className="text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}
