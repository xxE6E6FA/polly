import { useUser } from "@/hooks/use-user";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { resizeGoogleImageUrl } from "@/lib/utils";
import {
  CrownIcon,
  HashIcon,
  CalendarBlankIcon,
  ChatCircleTextIcon,
  ChatCircleIcon,
  TrendUpIcon,
  SparkleIcon,
} from "@phosphor-icons/react";

function getInitials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserIdCard() {
  const { user, monthlyUsage, hasUnlimitedCalls } = useUser();

  const userStats = useQuery(
    api.users.getUserStats,
    user && !user.isAnonymous ? { userId: user._id } : "skip"
  );

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
            <div className="hidden lg:flex items-center justify-between mb-4">
              <div className="flex items-center space-x-1.5">
                <CrownIcon className="h-4 w-4 text-primary" />
                <span className="font-bold text-xs tracking-wider text-primary">
                  POLLY MEMBER
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <HashIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs font-mono">
                  {userStats?.userId?.slice(-6).toUpperCase() || "LOAD"}
                </span>
              </div>
            </div>

            {/* Avatar - centered - hidden on mobile */}
            <div className="hidden lg:flex justify-center mb-3">
              <div className="relative">
                <Avatar className="h-36 w-36 ring-2 ring-border">
                  <AvatarImage
                    src={resizeGoogleImageUrl(user.image || "", 144)}
                    alt={user.name || "User"}
                  />
                  <AvatarFallback className="text-sm bg-gradient-primary text-primary-foreground">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* User info - centered - hidden on mobile */}
            <div className="hidden lg:block text-center space-y-1 mb-4">
              <h2 className="text-base font-bold text-foreground truncate">
                {user.name || "Unnamed User"}
              </h2>
              <p className="text-muted-foreground text-xs truncate">
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
            <div className="hidden lg:block space-y-2 mb-4">
              <div className="flex items-center justify-between bg-muted rounded-lg p-2.5 border border-border/50">
                <div className="flex items-center space-x-2">
                  <ChatCircleTextIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(220 95% 55%)" }}
                  />
                  <span className="text-foreground text-xs">Conversations</span>
                </div>
                <span className="text-foreground font-mono text-sm">
                  {userStats?.conversationCount || 0}
                </span>
              </div>

              <div className="flex items-center justify-between bg-muted rounded-lg p-2.5 border border-border/50">
                <div className="flex items-center space-x-2">
                  <ChatCircleIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(260 85% 60%)" }}
                  />
                  <span className="text-foreground text-xs">
                    Total Messages
                  </span>
                </div>
                <span className="text-foreground font-mono text-sm">
                  {userStats?.totalMessages || 0}
                </span>
              </div>

              <div className="flex items-center justify-between bg-muted rounded-lg p-2.5 border border-border/50">
                <div className="flex items-center space-x-2">
                  <TrendUpIcon
                    className="h-3.5 w-3.5"
                    style={{ color: "hsl(280 75% 65%)" }}
                  />
                  <span className="text-foreground text-xs">This Month</span>
                </div>
                <span className="text-foreground font-mono text-sm">
                  {monthlyUsage?.monthlyMessagesSent || 0}
                </span>
              </div>
            </div>

            {/* Usage bar - hidden for unlimited users */}
            {monthlyUsage && !hasUnlimitedCalls && (
              <div className="bg-muted rounded-lg p-3 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <SparkleIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-foreground text-xs">
                      Monthly Usage
                    </span>
                  </div>
                  <span className="text-foreground font-mono text-xs">
                    {monthlyUsage.monthlyMessagesSent}/
                    {monthlyUsage.monthlyLimit}
                  </span>
                </div>
                <Progress
                  value={usagePercentage}
                  className="h-2.5 bg-muted/60 border border-border/40 shadow-inner rounded-full"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5">
                  <span>{monthlyUsage.remainingMessages} remaining</span>
                  <span>
                    resets on{" "}
                    {(() => {
                      if (!userStats?.joinedAt) return "unknown";
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
          <div className="bg-muted rounded-lg p-3 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <SparkleIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground text-xs">Monthly Usage</span>
              </div>
              <span className="text-foreground font-mono text-xs">
                {monthlyUsage.monthlyMessagesSent}/{monthlyUsage.monthlyLimit}
              </span>
            </div>
            <Progress
              value={usagePercentage}
              className="h-2.5 bg-muted/60 border border-border/40 shadow-inner rounded-full"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5">
              <span className="font-mono">
                {monthlyUsage.remainingMessages} remaining
              </span>
              <span>
                resets on{" "}
                {(() => {
                  if (!userStats?.joinedAt) return "unknown";
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
}
