import { lazy, Suspense } from "react";
import { type RouteObject } from "react-router";
import RootLayout from "./components/layouts/RootLayout";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import { NotFoundPage } from "./components/ui/not-found-page";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { Spinner } from "./components/spinner";
import { RouteErrorBoundary } from "./components/layouts/RouteErrorBoundary";

// Lazy load heavier routes
const ChatLayout = lazy(() => import("./components/layouts/ChatLayout"));
const ChatConversationPage = lazy(() => import("./pages/ChatConversationPage"));
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
            element: (
              <Suspense fallback={<RouteLoader />}>
                <ChatConversationPage />
              </Suspense>
            ),
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
          <ProtectedRoute>
            <Suspense fallback={<RouteLoader />}>
              <SettingsLayout />
            </Suspense>
          </ProtectedRoute>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsIndexPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "api-keys",
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsApiKeysPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "models",
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsModelsPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas",
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsPersonasPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "about",
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsAboutPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/new",
            element: (
              <Suspense fallback={<RouteLoader />}>
                <SettingsNewPersonaPage />
              </Suspense>
            ),
            errorElement: <RouteErrorBoundary />,
          },
          {
            path: "personas/:id/edit",
            element: (
              <Suspense fallback={<RouteLoader />}>
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
