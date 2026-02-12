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
const SettingsApiKeysPage = lazy(() =>
  import("./components/settings/api-keys-tab").then(m => ({
    default: m.ApiKeysTab,
  }))
);
const SettingsModelsPage = lazy(() =>
  import("./components/settings/models-tab").then(m => ({
    default: m.ModelsTab,
  }))
);
const SettingsPersonasPage = lazy(() =>
  import("./components/settings/personas-tab").then(m => ({
    default: m.PersonasTab,
  }))
);
const SettingsSharedConversationsPage = lazy(
  () => import("./pages/settings/shared-conversations-page")
);
const SettingsArchivedConversationsPage = lazy(
  () => import("./pages/settings/archived-conversations-page")
);
const SettingsAttachmentsPage = lazy(
  () => import("./pages/settings/attachments-page")
);
const SettingsChatHistoryPage = lazy(
  () => import("./pages/settings/chat-history-page")
);
const SettingsGeneralPage = lazy(() => import("./pages/settings/general-page"));
const SettingsNewPersonaPage = lazy(
  () => import("./pages/settings/new-persona-page")
);
const SettingsEditPersonaPage = lazy(
  () => import("./pages/settings/edit-persona-page")
);
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
            path: "api-keys",
            element: withSuspense(<SettingsApiKeysPage />, "partial"),
            errorElement: routeErrorElement,
          },
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
                element: <div />, // Empty element since content is handled by parent
              },
              {
                path: "image",
                element: <div />, // Empty element since content is handled by parent
              },
              {
                path: "tts",
                element: <div />, // Empty element since content is handled by parent
              },
            ],
          },
          {
            path: "personas",
            element: withSuspense(<SettingsPersonasPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "shared-conversations",
            element: withSuspense(
              <SettingsSharedConversationsPage />,
              "partial"
            ),
            errorElement: routeErrorElement,
          },
          {
            path: "archived-conversations",
            element: withSuspense(
              <SettingsArchivedConversationsPage />,
              "partial"
            ),
            errorElement: routeErrorElement,
          },
          {
            path: "chat-history",
            element: withSuspense(<SettingsChatHistoryPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "attachments",
            element: withSuspense(<SettingsAttachmentsPage />, "partial"),
            errorElement: routeErrorElement,
          },
          {
            path: "general",
            element: withSuspense(<SettingsGeneralPage />, "partial"),
            errorElement: routeErrorElement,
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
      {
        path: "*",
        element: withSuspense(<NotFoundPage />),
      },
    ],
  },
];
