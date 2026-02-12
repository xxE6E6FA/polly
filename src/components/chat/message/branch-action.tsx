import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { GitBranchIcon } from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/providers/toast-context";
import { ActionButtons, DRAWER_ICON_SIZE, DrawerItem } from "./action-button";

export function BranchActionButton({
  conversationId,
  messageId,
  isEditing,
  onSuccess,
}: {
  conversationId: string;
  messageId: string;
  isEditing?: boolean;
  onSuccess: (newConversationId: string, assistantMessageId?: string) => void;
}) {
  const createBranch = useAction(api.branches.createBranch);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const managedToast = useToast();
  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const res = await createBranch({
        conversationId: conversationId as Id<"conversations">,
        messageId: messageId as Id<"messages">,
      });
      // Server-side streaming is now handled automatically by the Convex action
      onSuccess(res.conversationId, res.assistantMessageId);
      managedToast.success("Branched conversation");
    } catch (_e) {
      managedToast.error("Failed to create branch");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <ActionButtons.Branch
        disabled={isEditing}
        ariaLabel="Create a new conversation branch from this point"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will create a new conversation with all messages up to this
            point. Continue in the new branch afterwards.
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={loading} onClick={handleConfirm}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" variant="primary" />
                  <span>Creating…</span>
                </span>
              ) : (
                "Create branch"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BranchActionDrawerItem({
  conversationId,
  messageId,
  onSuccess,
}: {
  conversationId: string;
  messageId: string;
  onSuccess: (newConversationId: string, assistantMessageId?: string) => void;
}) {
  const createBranch = useAction(api.branches.createBranch);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const managedToast = useToast();
  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const res = await createBranch({
        conversationId: conversationId as Id<"conversations">,
        messageId: messageId as Id<"messages">,
      });
      onSuccess(res.conversationId, res.assistantMessageId);
      managedToast.success("Branched conversation");
    } catch (_e) {
      managedToast.error("Failed to create branch");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <DrawerItem
        icon={<GitBranchIcon className={DRAWER_ICON_SIZE} />}
        onClick={() => setOpen(true)}
      >
        Branch from here
      </DrawerItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will create a new conversation with all messages up to this
            point. Continue in the new branch afterwards.
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={loading} onClick={handleConfirm}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" variant="primary" />
                  <span>Creating…</span>
                </span>
              ) : (
                "Create branch"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
