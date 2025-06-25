import { lazy, Suspense } from "react";
import { type RouteObject } from "react-router";
import RootLayout from "./components/layouts/RootLayout";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import ChatConversationPage from "./pages/ChatConversationPage";
import ChatLayout from "./components/layouts/ChatLayout";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import { NotFoundPage } from "./components/ui/not-found-page";
import { ProtectedSuspense } from "./components/auth/ProtectedRoute";
import { Spinner } from "./components/spinner";
import { RouteErrorBoundary } from "./components/layouts/RouteErrorBoundary";

const SharePage = lazy(() => import("./pages/SharedConversationPage"));
const SettingsLayout = lazy(
  () => import("./components/layouts/SettingsMainLayout")
);
const SettingsIndexPage = lazy(() => import("./pages/settings/AboutPage"));
const SettingsApiKeysPage = lazy(() => import("./pages/settings/ApiKeysPage"));
const SettingsModelsPage = lazy(() => import("./pages/settings/ModelsPage"));
const SettingsPersonasPage = lazy(
  () => import("./pages/settings/PersonasPage")
);
const SettingsAboutPage = lazy(() => import("./pages/settings/AboutPage"));
const SettingsNewPersonaPage = lazy(
  () => import("./pages/settings/NewPersonaPage")
);
const SettingsEditPersonaPage = lazy(
  () => import("./pages/settings/EditPersonaPage")
);

// Unified page loader component
const PageLoader = ({
  size = "full",
}: {
  size?: "full" | "partial" | "compact";
}) => {
  const sizeClasses = {
    full: "min-h-screen",
    partial: "min-h-[400px]",
    compact: "min-h-[200px]",
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <Spinner />
    </div>
  );
};

// Preload settings module when hovering over settings links
export const preloadSettings = () => {
  import("./components/layouts/SettingsMainLayout");
  import("./pages/settings/AboutPage"); // Preload default settings page too
};

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "auth",
        element: <AuthPage />,
      },
      {
        path: "auth/callback",
        element: <AuthCallbackPage />,
      },
      {
        path: "chat",
        element: (
          <Suspense fallback={<PageLoader size="compact" />}>
            <ChatLayout />
          </Suspense>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: ":conversationId",
            element: <ChatConversationPage />,
            errorElement: <RouteErrorBoundary />,
          },
        ],
      },
      {
        path: "share/:shareId",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <SharePage />
          </Suspense>
        ),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "settings",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsLayout />
          </ProtectedSuspense>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsIndexPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "api-keys",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsApiKeysPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "models",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsModelsPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsPersonasPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "about",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsAboutPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/new",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsNewPersonaPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/:id/edit",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsEditPersonaPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
        ],
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];
