import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { MONTHLY_MESSAGE_LIMIT } from "./constants";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Google OAuth provider
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),

    // Password-based authentication (email/password)
    Password({
      // Customize password requirements if needed
      // You can add password strength validation here
    }),

    // Anonymous authentication for guest users
    Anonymous(),
  ],

  // Session configuration
  session: {
    // How long can a user session last without reauthentication (30 days)
    totalDurationMs: 30 * 24 * 60 * 60 * 1000,
    // How long can a user session last without activity (7 days)
    inactiveDurationMs: 7 * 24 * 60 * 60 * 1000,
  },

  // JWT configuration
  jwt: {
    // JWT validity duration (1 hour)
    durationMs: 60 * 60 * 1000,
  },

  // Sign-in configuration
  signIn: {
    // Max failed attempts per hour (rate limiting)
    maxFailedAttempsPerHour: 10,
  },

  callbacks: {
    // Custom user creation/update logic
    async createOrUpdateUser(ctx: MutationCtx, args) {
      const { existingUserId, profile, provider } = args;

      // Process user creation/update

      // Extract profile fields with proper types
      const profileName =
        typeof profile.name === "string" ? profile.name : undefined;
      const profileEmail =
        typeof profile.email === "string" ? profile.email : undefined;
      const profileImage =
        typeof profile.image === "string" ? profile.image : undefined;
      const profileEmailVerified = profile.emailVerified
        ? typeof profile.emailVerified === "number"
          ? profile.emailVerified
          : Date.now()
        : undefined;

      // Handle anonymous user graduation
      const stateObj = (args as { state?: { anonymousUserId?: string } }).state;
      const anonymousUserId = stateObj?.anonymousUserId as
        | Id<"users">
        | undefined;

      if (anonymousUserId) {
        const anonymousUser = await ctx.db.get(anonymousUserId);

        if (anonymousUser?.isAnonymous) {
          // Graduate the anonymous user by updating their record
          await ctx.db.patch(anonymousUserId, {
            name: profileName || anonymousUser.name,
            email: profileEmail || anonymousUser.email,
            emailVerified: profileEmailVerified || anonymousUser.emailVerified,
            image: profileImage || anonymousUser.image,
            isAnonymous: false,
            monthlyMessagesSent: anonymousUser.messagesSent || 0,
            monthlyLimit: MONTHLY_MESSAGE_LIMIT,
            lastMonthlyReset: Date.now(),
            conversationCount: anonymousUser.conversationCount || 0,
            totalMessageCount: anonymousUser.totalMessageCount || 0,
          });

          return anonymousUserId;
        }
      }

      // Update existing user
      if (existingUserId) {
        const existingUser = await ctx.db.get(existingUserId);
        if (!existingUser) {
          console.error(
            `[Auth] User document ${existingUserId} doesn't exist (orphaned account)`
          );
          throw new ConvexError("User account is in an invalid state");
        }

        // Update user with latest auth data
        await ctx.db.patch(existingUserId, {
          name: profileName || existingUser.name,
          email: profileEmail || existingUser.email,
          emailVerified: profileEmailVerified || existingUser.emailVerified,
          image: profileImage || existingUser.image,
          isAnonymous: false,
        });

        return existingUserId;
      }

      // Check if there are any recent anonymous users that could be candidates for graduation
      // This is a fallback for cases where the anonymous user ID is lost
      const recentAnonymousUsers = await ctx.db
        .query("users")
        .filter(q => q.eq(q.field("isAnonymous"), true))
        .order("desc")
        .take(10); // Check last 10 anonymous users

      // If there's only one recent anonymous user, it's likely the one to graduate
      if (recentAnonymousUsers.length === 1) {
        const anonymousUser = recentAnonymousUsers[0];

        await ctx.db.patch(anonymousUser._id, {
          name: profileName || anonymousUser.name,
          email: profileEmail || anonymousUser.email,
          emailVerified: profileEmailVerified || anonymousUser.emailVerified,
          image: profileImage || anonymousUser.image,
          isAnonymous: false,
          monthlyMessagesSent: anonymousUser.messagesSent || 0,
          monthlyLimit: MONTHLY_MESSAGE_LIMIT,
          lastMonthlyReset: Date.now(),
          conversationCount: anonymousUser.conversationCount || 0,
          totalMessageCount: anonymousUser.totalMessageCount || 0,
        });
        return anonymousUser._id;
      }

      // Create new user
      const now = Date.now();

      // Check if email already exists (for email-based providers)
      if (profileEmail) {
        const existingEmailUser = await ctx.db
          .query("users")
          .withIndex("email", q => q.eq("email", profileEmail))
          .first();

        if (existingEmailUser) {
          return existingEmailUser._id;
        }
      }

      // Create new user document
      const userId = await ctx.db.insert("users", {
        name: profileName,
        email: profileEmail,
        emailVerified: profileEmailVerified,
        image: profileImage,
        isAnonymous: provider.id === "anonymous",
        createdAt: now,
        messagesSent: 0,
        monthlyMessagesSent: 0,
        monthlyLimit: MONTHLY_MESSAGE_LIMIT,
        lastMonthlyReset: now,
        conversationCount: 0,
        totalMessageCount: 0,
      });

      return userId;
    },

    // Additional callback after user is created/updated
    async afterUserCreatedOrUpdated(ctx: MutationCtx, args) {
      const { userId, existingUserId, type } = args;

      // User sign-in event

      // You can add additional logic here like:
      // - Creating default settings for new users
      // - Sending welcome emails
      // - Updating user activity timestamps
      // - Creating audit logs

      // Example: Create default settings for new users
      if (!existingUserId && type !== "verification") {
        const existingSettings = await ctx.db
          .query("userSettings")
          .withIndex("by_user", q => q.eq("userId", userId))
          .first();

        if (!existingSettings) {
          await ctx.db.insert("userSettings", {
            userId,
            personasEnabled: true,
            openRouterSorting: "default",
            autoArchiveEnabled: false,
            autoArchiveDays: 30,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    },
  },
});

// Export typed auth functions for use in other files
export type { SignInAction, SignOutAction } from "@convex-dev/auth/server";
