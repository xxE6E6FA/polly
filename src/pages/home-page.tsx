import { useEffect } from "react";
import { ChatZeroState } from "@/components/chat";
import { usePrivateMode } from "@/providers/private-mode-context";

export default function HomePage() {
  const { setPrivateMode } = usePrivateMode();

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

  return (
    <>
      <title>Polly</title>
      <ChatZeroState />
    </>
  );
}
