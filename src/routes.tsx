import { lazy, Suspense } from "react";
import { Navigate, type RouteObject } from "react-router";
import { ProtectedSuspense } from "./components/auth/ProtectedRoute";
import { ConversationView } from "./components/conversation-view/ConversationView";
import ChatLayout from "./components/layouts/ChatLayout";
import PersistentChatLayout from "./components/layouts/PersistentChatLayout";
import RootLayout from "./components/layouts/RootLayout";
import { Spinner } from "./components/spinner";

import HomePage from "./pages/HomePage";
import PrivateChatPage from "./pages/PrivateChatPage";

const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));

const AuthPage = lazy(() => import("./pages/AuthPage"));
const NotFoundPage = lazy(() =>
  import("./components/ui/not-found-page").then(m => ({
    default: m.NotFoundPage,
  }))
);
const RouteErrorBoundary = lazy(() =>
  import("./components/layouts/RouteErrorBoundary").then(m => ({
    default: m.RouteErrorBoundary,
  }))
);
const SharePage = lazy(() => import("./pages/SharedConversationPage"));
const SettingsLayout = lazy(
  () => import("./components/layouts/SettingsMainLayout")
);
const SettingsStandaloneLayout = lazy(
  () => import("./components/layouts/SettingsStandaloneLayout")
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
  () => import("./pages/settings/SharedConversationsPage")
);
const SettingsArchivedConversationsPage = lazy(
  () => import("./pages/settings/ArchivedConversationsPage")
);
const SettingsAttachmentsPage = lazy(
  () => import("./pages/settings/AttachmentsPage")
);
const SettingsChatHistoryPage = lazy(
  () => import("./pages/settings/ChatHistoryPage")
);
const SettingsGeneralPage = lazy(() => import("./pages/settings/GeneralPage"));
const SettingsNewPersonaPage = lazy(
  () => import("./pages/settings/NewPersonaPage")
);
const SettingsEditPersonaPage = lazy(
  () => import("./pages/settings/EditPersonaPage")
);
const SignOutPage = lazy(() => import("./pages/SignOutPage"));

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

export const preloadSettings = () => {
  import("./components/layouts/SettingsMainLayout");
  import("./pages/settings/GeneralPage");
};
export const preloadAuth = () => {
  import("./pages/AuthPage");
};
export const preloadChatConversation = () => {
  import("./pages/ChatConversationPage");
};

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: (
      <Suspense fallback={<PageLoader size="full" />}>
        <RouteErrorBoundary />
      </Suspense>
    ),
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "signout",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <SignOutPage />
          </Suspense>
        ),
      },
      {
        path: "auth",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <AuthPage />
          </Suspense>
        ),
      },
      {
        path: "private",
        element: <ChatLayout />,
        children: [
          {
            index: true,
            element: (
              <ProtectedSuspense fallback={<PageLoader size="full" />}>
                <PrivateChatPage />
              </ProtectedSuspense>
            ),
          },
        ],
      },
      {
        path: "chat",
        element: <PersistentChatLayout />,
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            path: ":conversationId",
            element: <ConversationView />,
          },
          {
            path: "favorites",
            element: (
              <Suspense fallback={<PageLoader size="full" />}>
                <ProtectedSuspense fallback={<PageLoader size="full" />}>
                  <FavoritesPage />
                </ProtectedSuspense>
              </Suspense>
            ),
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
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsLayout />
          </ProtectedSuspense>
        ),
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <Navigate to="/settings/general" replace />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "api-keys",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsApiKeysPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "models",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsModelsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
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
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsPersonasPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "shared-conversations",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsSharedConversationsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "archived-conversations",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsArchivedConversationsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "chat-history",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsChatHistoryPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "attachments",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsAttachmentsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "general",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsGeneralPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
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
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsNewPersonaPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
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
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsEditPersonaPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: "*",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
];
