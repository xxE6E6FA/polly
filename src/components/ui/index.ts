/**
 * @module ui
 * @description Base UI primitives built on Base UI + TailwindCSS + CVA
 *
 * ## Categories
 *
 * ### Form Controls
 * - Button, Input, Textarea, Select, Switch, Slider, Label
 *
 * ### Overlays
 * - Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu
 *
 * ### Display
 * - Avatar, Badge, Card, Skeleton, Progress
 *
 * ### Feedback
 * - Alert, ErrorBoundary, ConfirmationDialog, NotificationDialog
 *
 * ### Content
 * - CodeBlock, MarkdownBlock, StreamingMarkdown
 *
 * @example
 * import { Button, Dialog, DialogContent } from "@/components/ui";
 */

// =============================================================================
// Form Controls
// =============================================================================

export type { ButtonProps } from "./button";
export {
  Button,
  buttonVariants,
  menuItemBaseStyles,
  menuItemStateStyles,
} from "./button";
export type { ChatInputIconButtonProps } from "./chat-input-icon-button";
export { ChatInputIconButton } from "./chat-input-icon-button";
export { EnhancedSlider } from "./enhanced-slider";
export { Input } from "./input";
export { Label } from "./label";
export { SearchInput } from "./search-input";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Slider } from "./slider";
export { Switch } from "./switch";
export { Textarea } from "./textarea";

export { ToggleGroup, ToggleGroupItem } from "./toggle-group";

// =============================================================================
// Overlays & Dialogs
// =============================================================================

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./command";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
export {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export {
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

// =============================================================================
// Display Components
// =============================================================================

export { AnimatedLogo } from "./animated-logo";
export { Avatar, AvatarFallback, AvatarImage } from "./avatar";
export { Backdrop } from "./backdrop";
export type { BadgeProps } from "./badge";
export { Badge, badgeVariants } from "./badge";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
export type { CarouselApi } from "./carousel";
export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";
export type {
  BackgroundJob,
  JobProgressCardProps,
  MultiJobProgressProps,
} from "./progress";
export { JobProgressCard, MultiJobProgress, Progress } from "./progress";
export { Skeleton } from "./skeleton";
export { SkeletonText } from "./skeleton-text";
export { ThemeToggle } from "./theme-toggle";

// =============================================================================
// Feedback & Alerts
// =============================================================================

export {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  alertVariants,
} from "./alert";
export { ChatWarningBanner } from "./chat-warning-banner";
export { ConfirmationDialog } from "./confirmation-dialog";
export { ErrorBoundary, withErrorBoundary } from "./error-boundary";
export { NotificationDialog } from "./notification-dialog";
export { Toaster } from "./sonner";
export { TextInputDialog } from "./text-input-dialog";

// =============================================================================
// Content & Markdown
// =============================================================================

export { CodeBlock } from "./code-block";
export { CodeBlockWrapper, CodeBlockWrapperLLM } from "./code-block-wrapper";
export { MarkdownBlock } from "./markdown-block";
export {
  StreamingMarkdown,
  useIsStreaming,
  useMessageId,
  useStreamingContext,
} from "./streaming-markdown";

// =============================================================================
// Citations
// =============================================================================

export { CitationProvider, useCitations } from "@/providers/citation-context";
export type { CitationGroupProps } from "./citation-group";
export { CitationGroup } from "./citation-group";
export { CitationLink } from "./citation-link";
export { CitationPill, CitationPillSkeleton } from "./citation-pill";
export type { Citation, CitationPreviewPopupProps } from "./citation-popover";
export { CitationPreviewPopup } from "./citation-popover";

// =============================================================================
// Pickers & Selection
// =============================================================================

export { EmojiPicker, EmojiPickerContent } from "./emoji-picker";
export { EmojiPickerDrawer } from "./emoji-picker-drawer";
export {
  PickerBody,
  PickerDescription,
  PickerDivider,
  PickerFooter,
  PickerHeader,
  PickerOption,
  PickerOptionCompact,
  PickerSection,
} from "./picker-content";
export { PickerTrigger, pickerTriggerVariants } from "./picker-trigger";
export { ResponsivePicker } from "./responsive-picker";
export {
  SelectableListItem,
  SelectableListItemIcon,
} from "./selectable-list-item";
export type { VoiceListOption } from "./voice-list";
export { VoiceList } from "./voice-list";
export type { VoiceOption } from "./voice-select";
export { VoiceSelect } from "./voice-select";

// =============================================================================
// Dialogs & Utilities
// =============================================================================

export { AttachmentGalleryDialog } from "./attachment-gallery-dialog";
export { ConversationStarterPopover } from "./conversation-starter-popover";
export { QuoteButton } from "./quote-button";
export {
  ControlledShareConversationDialog,
  ShareConversationDialog,
} from "./share-conversation-dialog";

// =============================================================================
// Status & Indicators
// =============================================================================

export { GlobalDragDropPrevention } from "./global-drag-drop-prevention";
export { NotFoundPage } from "./not-found-page";
export { OfflinePlaceholder } from "./offline-placeholder";
export { getOnlineSnapshot, OnlineStatus } from "./online-status";
export { Spinner } from "./spinner";
