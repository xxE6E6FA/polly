import { Sidebar } from "@/components/sidebar";

interface SharedChatLayoutProps {
  children: React.ReactNode;
}

export function SharedChatLayout({ children }: SharedChatLayoutProps) {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
