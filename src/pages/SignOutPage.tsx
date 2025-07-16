import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { cleanupAuthenticatedUser } from "@/lib/auth-utils";
import { clearAllPollyKeys } from "@/lib/local-storage";

export default function SignOutPage() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  useEffect(() => {
    clearAllPollyKeys();
    cleanupAuthenticatedUser();
    signOut();
    navigate("/", { replace: true });
  }, [signOut, navigate]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <span>Signing out…</span>
    </div>
  );
}
