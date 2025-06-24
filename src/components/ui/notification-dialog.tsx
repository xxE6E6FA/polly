import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

interface NotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  type?: "success" | "error" | "warning" | "info";
  actionText?: string;
  onAction?: () => void;
}

const typeConfig = {
  error: {
    icon: XCircle,
    color: "text-danger",
    title: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning",
    title: "Warning",
  },
  success: {
    icon: CheckCircle,
    color: "text-success",
    title: "Success",
  },
  info: {
    icon: Info,
    color: "text-info",
    title: "Information",
  },
};

export function NotificationDialog({
  open,
  onOpenChange,
  title,
  description,
  type = "info",
  actionText = "OK",
  onAction,
}: NotificationDialogProps) {
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
}
