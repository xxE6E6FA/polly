import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { useTheme } from "@/hooks/use-theme";
import { ROUTES } from "@/lib/routes";

/**
 * Clerk appearance that maps to CSS custom properties so it
 * follows the app's light / dark theme automatically.
 */
function useClerkAppearance() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Clerk variables integrate with the app's CSS custom properties.
  // We read the computed values at render so they reflect the active theme.
  return {
    variables: {
      colorPrimary: isDark ? "hsl(0 0% 95%)" : "hsl(0 0% 10%)",
      colorText: isDark ? "hsl(0 0% 98%)" : "hsl(0 0% 5%)",
      colorTextSecondary: isDark ? "hsl(0 0% 75%)" : "hsl(0 0% 40%)",
      colorBackground: isDark ? "hsl(0 0% 10%)" : "hsl(0 0% 100%)",
      colorInputBackground: isDark ? "hsl(0 0% 12%)" : "hsl(0 0% 100%)",
      colorInputText: isDark ? "hsl(0 0% 98%)" : "hsl(0 0% 5%)",
      colorNeutral: isDark ? "hsl(0 0% 98%)" : "hsl(0 0% 10%)",
      borderRadius: "0.375rem",
    },
    elements: {
      rootBox: "!w-full !overflow-visible",
      cardBox: "!w-full !shadow-none !overflow-visible",
      card: "!bg-transparent !shadow-none !border-0 !p-0 !w-full !max-w-none !overflow-visible",
      main: "!w-full",
      socialButtons: "!w-full",
      headerTitle: "hidden",
      headerSubtitle: "hidden",
      socialButtonsBlockButton:
        "!border-border !text-foreground hover:!bg-muted/60 !rounded-md !transition-colors",
      socialButtonsBlockButtonText: "!font-medium",
      dividerLine: "!bg-border",
      dividerText: "!text-muted-foreground",
      formButtonPrimary:
        "!bg-primary !text-primary-foreground hover:!bg-primary-hover !rounded-md !shadow-none !transition-colors",
      formFieldLabel: "!text-foreground",
      formFieldInput:
        "!bg-input !border-border !text-foreground !rounded-md focus:!ring-2 focus:!ring-ring focus:!border-transparent",
      footer: "hidden",
      identityPreview: "!bg-muted/40 !border-border",
      identityPreviewText: "!text-foreground",
      identityPreviewEditButton: "!text-muted-foreground",
      formFieldAction: "!text-muted-foreground hover:!text-foreground",
      alert: "!bg-muted/40 !border-border !text-foreground",
    },
  };
}

export default function AuthPage() {
  const clerkAppearance = useClerkAppearance();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <SignedIn>
        <AlreadySignedIn />
      </SignedIn>
      <SignedOut>
        <div className="w-full max-w-[400px] stack-lg px-6 py-12">
          <div className="text-center stack-sm">
            <div className="flex justify-center">
              <AnimatedLogo size={64} alt="Polly logo" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Sign in to Polly
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your AI conversations, models, and settings in one place
              </p>
            </div>
          </div>

          <SignIn
            routing="hash"
            forceRedirectUrl={ROUTES.HOME}
            appearance={clerkAppearance}
          />
        </div>
      </SignedOut>
    </div>
  );
}

function AlreadySignedIn() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(ROUTES.HOME, { replace: true });
  }, [navigate]);
  return null;
}
