import { Sidebar } from "@/components/sidebar";

type SharedChatLayoutProps = {
  children: React.ReactNode;
};

export const SharedChatLayout = ({ children }: SharedChatLayoutProps) => {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
};
