import {
  CalendarBlankIcon,
  ChatCircleIcon,
  ChatCircleTextIcon,
  CrownIcon,
  HashIcon,
  SparkleIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/hooks/use-user";
import { useAuthenticatedUserId } from "@/hooks/use-authenticated-user-id";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn, resizeGoogleImageUrl } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";

function getInitials(name?: string | null) {
  if (!name) {
    return "U";
  }
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const UserIdCard = () => {
  const { user, monthlyUsage, hasUnlimitedCalls } = useUser();
  const authenticatedUserId = useAuthenticatedUserId();
  const userSettings = useUserSettings();

  const userStats = useQuery(
    api.users.getUserStats,
    authenticatedUserId ? { userId: authenticatedUserId } : "skip"
  );

  const shouldAnonymize = userSettings?.anonymizeForDemo ?? false;

  if (!user || user.isAnonymous) {
    return null;
  }

  const usagePercentage = monthlyUsage
    ? (monthlyUsage.monthlyMessagesSent / monthlyUsage.monthlyLimit) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* ID Card - desktop only */}
      <div className="relative hidden lg:block">
        <div
          className="relative w-full border border-border/60 shadow-md"
          style={{
            background: `hsl(var(--surface-primary))`,
            borderRadius: "0.75rem",
            overflow: "hidden",
          }}
        >
          {/* Card content */}
          <div className="relative z-10 p-4">
            {/* Header with crown icon - hidden on mobile */}
            <div className="mb-4 hidden items-center justify-between lg:flex">
              <div className="flex items-center space-x-1.5">
                <CrownIcon className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold tracking-wider text-primary">
                  POLLY MEMBER
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <HashIcon className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">
                  {userStats?.userId?.slice(-6).toUpperCase() || "LOAD"}
                </span>
              </div>
            </div>

            {/* Avatar - centered - hidden on mobile */}
            <div className="mb-3 hidden justify-center lg:flex">
              <div className={cn("relative", shouldAnonymize && "blur-lg")}>
                <Avatar className="h-36 w-36 ring-2 ring-border">
                  <AvatarImage
                    alt={user.name || "User"}
                    src={resizeGoogleImageUrl(user.image || "", 144)}
                  />
                  <AvatarFallback className="bg-gradient-primary text-sm text-primary-foreground">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* User info - centered - hidden on mobile */}
            <div className="mb-4 hidden space-y-1 text-center lg:block">
              <h2
                className={cn(
                  "truncate text-base font-bold text-foreground",
                  shouldAnonymize && "blur-md"
                )}
              >
                {user.name || "Unnamed User"}
              </h2>
              <p
                className={cn(
                  "truncate text-xs text-muted-foreground",
                  shouldAnonymize && "blur-md"
                )}
              >
                {user.email}
              </p>
              <div className="flex items-center justify-center space-x-1 text-muted-foreground">
                <CalendarBlankIcon className="h-3 w-3" />
                <span className="text-xs">
                  {userStats?.joinedAt
                    ? new Date(userStats.joinedAt).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })
                    : "Unknown"}
                </span>
              </div>
            </div>

            {/* Stats - vertical list - hidden on mobile */}
            <div className="mb-4 hidden space-y-2 lg:block">
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted p-2.5">
                <div className="flex items-center space-x-2">
                  <ChatCircleTextIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(220 95% 55%)" }}
                  />
                  <span className="text-xs text-foreground">Conversations</span>
                </div>
                <span className="font-mono text-sm text-foreground">
                  {userStats?.conversationCount || 0}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted p-2.5">
                <div className="flex items-center space-x-2">
                  <ChatCircleIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(260 85% 60%)" }}
                  />
                  <span className="text-xs text-foreground">
                    Total Messages
                  </span>
                </div>
                <span className="font-mono text-sm text-foreground">
                  {userStats?.totalMessages || 0}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted p-2.5">
                <div className="flex items-center space-x-2">
                  <TrendUpIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(280 75% 65%)" }}
                  />
                  <span className="text-xs text-foreground">This Month</span>
                </div>
                <span className="font-mono text-sm text-foreground">
                  {monthlyUsage?.monthlyMessagesSent || 0}
                </span>
              </div>
            </div>

            {/* Usage bar - hidden for unlimited users */}
            {monthlyUsage && !hasUnlimitedCalls && (
              <div className="rounded-lg border border-border/50 bg-muted p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <SparkleIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-foreground">
                      Monthly Usage
                    </span>
                  </div>
                  <span className="font-mono text-xs text-foreground">
                    {monthlyUsage.monthlyMessagesSent}/
                    {monthlyUsage.monthlyLimit}
                  </span>
                </div>
                <Progress
                  className="h-2.5 rounded-full border border-border/40 bg-muted/60 shadow-inner"
                  value={usagePercentage}
                />
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{monthlyUsage.remainingMessages} remaining</span>
                  <span>
                    resets on{" "}
                    {(() => {
                      if (!userStats?.joinedAt) {
                        return "unknown";
                      }
                      const joinDate = new Date(userStats.joinedAt);
                      const now = new Date();
                      const joinDay = joinDate.getDate();

                      // Calculate next reset date
                      let resetDate = new Date(
                        now.getFullYear(),
                        now.getMonth(),
                        joinDay
                      );

                      // If the reset date for this month has already passed, move to next month
                      if (resetDate <= now) {
                        resetDate = new Date(
                          now.getFullYear(),
                          now.getMonth() + 1,
                          joinDay
                        );
                      }

                      // Handle edge case where the join day doesn't exist in the target month (e.g., Jan 31 -> Feb 31)
                      if (resetDate.getDate() !== joinDay) {
                        resetDate = new Date(
                          resetDate.getFullYear(),
                          resetDate.getMonth() + 1,
                          0
                        ); // Last day of the month
                      }

                      return resetDate.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      });
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom gradient border */}
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5"
            style={{
              background: `linear-gradient(90deg, 
                hsl(220 95% 55%), 
                hsl(260 85% 60%), 
                hsl(280 75% 65%), 
                hsl(var(--primary)), 
                hsl(220 95% 55%)
              )`,
            }}
          />
        </div>
      </div>

      {/* Mobile usage section - standalone - hidden for unlimited users */}
      <div className="lg:hidden">
        {monthlyUsage && !hasUnlimitedCalls && (
          <div className="rounded-lg border border-border/60 bg-muted p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <SparkleIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-foreground">Monthly Usage</span>
              </div>
              <span className="font-mono text-xs text-foreground">
                {monthlyUsage.monthlyMessagesSent}/{monthlyUsage.monthlyLimit}
              </span>
            </div>
            <Progress
              className="h-2.5 rounded-full border border-border/40 bg-muted/60 shadow-inner"
              value={usagePercentage}
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">
                {monthlyUsage.remainingMessages} remaining
              </span>
              <span>
                resets on{" "}
                {(() => {
                  if (!userStats?.joinedAt) {
                    return "unknown";
                  }
                  const joinDate = new Date(userStats.joinedAt);
                  const now = new Date();
                  const joinDay = joinDate.getDate();

                  // Calculate next reset date
                  let resetDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    joinDay
                  );

                  // If the reset date for this month has already passed, move to next month
                  if (resetDate <= now) {
                    resetDate = new Date(
                      now.getFullYear(),
                      now.getMonth() + 1,
                      joinDay
                    );
                  }

                  // Handle edge case where the join day doesn't exist in the target month (e.g., Jan 31 -> Feb 31)
                  if (resetDate.getDate() !== joinDay) {
                    resetDate = new Date(
                      resetDate.getFullYear(),
                      resetDate.getMonth() + 1,
                      0
                    ); // Last day of the month
                  }

                  return resetDate.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  });
                })()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
