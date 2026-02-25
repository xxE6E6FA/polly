import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { ProtectedSuspense } from "./components/auth/protected-route";
import ChatLayout from "./components/layouts/chat-layout";
import { PrivateModeRoute } from "./components/layouts/private-mode-route";
import RootLayout from "./components/layouts/root-layout";
import { RouteErrorBoundary } from "./components/layouts/route-error-boundary";
// Prefer eager import for critical error/404 UI so offline navigation has a guard
import { NotFoundPage } from "./components/ui/not-found-page";
import { Spinner } from "./components/ui/spinner";
import { conversationLoader } from "./loaders/conversation-loader";

import HomePage from "./pages/home-page";
import PrivateChatPage from "./pages/private-chat-page";

const ChatConversationPage = lazy(
  () => import("./pages/chat-conversation-page")
);

const FavoritesPage = lazy(() => import("./pages/favorites-page"));

const AuthPage = lazy(() => import("./pages/auth-page"));

const SharePage = lazy(() => import("./pages/shared-conversation-page"));
const SettingsLayout = lazy(
  () => import("./components/layouts/settings-main-layout")
);
const SettingsStandaloneLayout = lazy(
  () => import("./components/layouts/settings-standalone-layout")
);
const SettingsModelsPage = lazy(() =>
  import("./components/settings/models-tab").then(m => ({
    default: m.ModelsTab,
  }))
);
const SettingsPersonasPage = lazy(() =>
  import("./components/settings/personas-tab").then(m => ({
    default: m.PersonasTabContent,
  }))
);
const SettingsGeneralPage = lazy(() => import("./pages/settings/general-page"));
const SettingsMemoryPage = lazy(() => import("./pages/settings/memory-page"));
const SettingsHistoryPage = lazy(
  () => import("./pages/settings/chat-history-page")
);
const SettingsFilesPage = lazy(
  () => import("./pages/settings/attachments-page")
);
const SettingsNewPersonaPage = lazy(
  () => import("./pages/settings/new-persona-page")
);
const SettingsEditPersonaPage = lazy(
  () => import("./pages/settings/edit-persona-page")
);
const CanvasPage = lazy(() => import("./pages/canvas-page"));
const SignOutPage = lazy(() => import("./pages/sign-out-page"));

const PageLoader = ({
  size = "full",
}: {
  size?: "full" | "partial" | "compact";
}) => {
  const sizeClasses = {
    full: "min-h-[100dvh]",
    partial: "min-h-[400px]",
    compact: "min-h-[200px]",
  };
  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <Spinner />
    </div>
  );
};

function withSuspense(element: ReactNode, size: "full" | "partial" = "full") {
  return <Suspense fallback={<PageLoader size={size} />}>{element}</Suspense>;
}

const routeErrorElement = withSuspense(<RouteErrorBoundary />);

export const preloadSettings = () => {
  import("./components/layouts/settings-main-layout");
  import("./pages/settings/general-page");
};
export const preloadAuth = () => {
  import("./pages/auth-page");
};
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: routeErrorElement,
    children: [
      // All chat routes share the same ChatLayout to prevent re-mounting
      {
        element: <ChatLayout />,
        errorElement: routeErrorElement,
        children: [
          {
            index: true,
            element: (
              <PrivateModeRoute enabled={false}>
                <HomePage />
              </PrivateModeRoute>
            ),
          },
          {
            path: "chat/:conversationId",
            loader: conversationLoader,
            element: withSuspense(
              <PrivateModeRoute enabled={false}>
                <ChatConversationPage />
              </PrivateModeRoute>
            ),
          },
          {
            path: "chat/favorites",
            element: withSuspense(
              <ProtectedSuspense fallback={<PageLoader size="full" />}>
                <PrivateModeRoute enabled={false}>
                  <FavoritesPage />
                </PrivateModeRoute>
              </ProtectedSuspense>
            ),
          },
          {
            path: "private",
            element: (
              <ProtectedSuspense fallback={<PageLoader size="full" />}>
                <PrivateModeRoute enabled>
                  <PrivateChatPage />
                </PrivateModeRoute>
              </ProtectedSuspense>
            ),
          },
        ],
      },
      {
        path: "canvas",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <CanvasPage />
          </ProtectedSuspense>
        ),
        errorElement: routeErrorElement,
      },
      {
        path: "signout",
        element: withSuspense(<SignOutPage />),
      },
      {
        path: "auth",
        element: withSuspense(<AuthPage />),
      },
      {
        path: "share/:shareId",
        element: withSuspense(<SharePage />),
        errorElement: routeErrorElement,
      },
      {
        path: "settings",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsLayout />
          </ProtectedSuspense>
        ),
        errorElement: routeErrorElement,
        children: [
          {
            index: true,
            element: withSuspense(
              <Navigate to="/settings/general" replace />,
              "partial"
            ),
            errorElement: routeErrorElement,
          },
          {
            path: "general",
            element: withSuspense(<SettingsGeneralPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "personas",
            element: withSuspense(<SettingsPersonasPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "memory",
            element: withSuspense(<SettingsMemoryPage />, "partial"),
            errorElement: routeErrorElement,
          },
          // Models group (keeps sub-tabs)
          {
            path: "models",
            element: withSuspense(<SettingsModelsPage />, "partial"),
            errorElement: routeErrorElement,
            children: [
              {
                index: true,
                element: <Navigate to="text" replace />,
              },
              {
                path: "text",
                element: <div />,
              },
              {
                path: "image",
                element: <div />,
              },
              {
                path: "tts",
                element: <div />,
              },
              {
                path: "keys",
                element: <div />,
              },
            ],
          },
          {
            path: "history",
            element: withSuspense(<SettingsHistoryPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "files",
            element: withSuspense(<SettingsFilesPage />, "partial"),
            errorElement: routeErrorElement,
          },
          // Redirects from old paths
          {
            path: "history/archived",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "history/shared",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "api-keys",
            element: <Navigate to="/settings/models/keys" replace />,
          },
          {
            path: "shared-conversations",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "archived-conversations",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "chat-history",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "attachments",
            element: <Navigate to="/settings/files" replace />,
          },
          {
            path: "profiles",
            element: <Navigate to="/settings/general" replace />,
          },
          // Redirects from old nested paths
          {
            path: "personalization/personas",
            element: <Navigate to="/settings/personas" replace />,
          },
          {
            path: "personalization/memory",
            element: <Navigate to="/settings/memory" replace />,
          },
          {
            path: "conversations/history",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "conversations/archived",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "conversations/shared",
            element: <Navigate to="/settings/history" replace />,
          },
          {
            path: "conversations/files",
            element: <Navigate to="/settings/files" replace />,
          },
        ],
      },
      {
        path: "settings/personas/new",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsStandaloneLayout />
          </ProtectedSuspense>
        ),
        errorElement: routeErrorElement,
        children: [
          {
            index: true,
            element: withSuspense(<SettingsNewPersonaPage />, "partial"),
            errorElement: routeErrorElement,
          },
        ],
      },
      {
        path: "settings/personas/:id/edit",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsStandaloneLayout />
          </ProtectedSuspense>
        ),
        errorElement: routeErrorElement,
        children: [
          {
            index: true,
            element: withSuspense(<SettingsEditPersonaPage />, "partial"),
            errorElement: routeErrorElement,
          },
        ],
      },
      // Redirects for old persona standalone routes
      {
        path: "settings/personalization/personas/new",
        element: <Navigate to="/settings/personas/new" replace />,
      },
      {
        path: "settings/personalization/personas/:id/edit",
        element: <Navigate to="/settings/personas/:id/edit" replace />,
      },
      {
        path: "*",
        element: withSuspense(<NotFoundPage />),
      },
    ],
  },
];
