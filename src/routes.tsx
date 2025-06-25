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

// Route loading component
const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <Spinner />
  </div>
);

// Settings-specific loader that matches the ProtectedRoute loading state
const SettingsLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Spinner />
  </div>
);

// Settings page loader for sub-pages (shows within the settings layout)
const SettingsPageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <Spinner />
  </div>
);

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
          <Suspense fallback={<RouteLoader />}>
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
          <Suspense fallback={<RouteLoader />}>
            <SharePage />
          </Suspense>
        ),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "settings",
        element: (
          <ProtectedSuspense fallback={<SettingsLoader />}>
            <SettingsLayout />
          </ProtectedSuspense>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsIndexPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "api-keys",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsApiKeysPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "models",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsModelsPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsPersonasPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "about",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsAboutPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/new",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
                <SettingsNewPersonaPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/:id/edit",
            element: (
              <Suspense fallback={<SettingsPageLoader />}>
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
