import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type NotificationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  type?: "success" | "error" | "warning" | "info";
  actionText?: string;
  onAction?: () => void;
};

const typeConfig = {
  error: {
    icon: XCircleIcon,
    color: "text-danger",
    title: "Error",
  },
  warning: {
    icon: WarningIcon,
    color: "text-warning",
    title: "Warning",
  },
  success: {
    icon: CheckCircleIcon,
    color: "text-success",
    title: "Success",
  },
  info: {
    icon: InfoIcon,
    color: "text-info",
    title: "Information",
  },
};

export const NotificationDialog = ({
  open,
  onOpenChange,
  title,
  description,
  type = "info",
  actionText = "OK",
  onAction,
}: NotificationDialogProps) => {
  const handleAction = () => {
    onAction?.();
    onOpenChange(false);
  };

  const IconComponent = typeConfig[type].icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <IconComponent className={`h-5 w-5 ${typeConfig[type].color}`} />
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="ml-8">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleAction}>
            {actionText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
