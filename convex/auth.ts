import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { MONTHLY_MESSAGE_LIMIT } from "../shared/constants";
import type { MutationCtx } from "./_generated/server";
import { log } from "./lib/logger";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Google OAuth provider
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
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

      // Extract profile fields with proper types
      const profileName =
        typeof profile.name === "string" ? profile.name : undefined;
      const profileEmail =
        typeof profile.email === "string" ? profile.email : undefined;
      const profileImage =
        typeof profile.image === "string" ? profile.image : undefined;
      let profileEmailVerified: number | undefined;
      if (profile.emailVerified) {
        profileEmailVerified =
          typeof profile.emailVerified === "number"
            ? profile.emailVerified
            : Date.now();
      }

      // Update existing user
      if (existingUserId) {
        const existingUser = await ctx.db.get(existingUserId);
        if (!existingUser) {
          log.error(
            `User document ${existingUserId} doesn't exist (orphaned account)`
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

      // Check if there's an existing user with the same email (for email-based providers)
      if (profileEmail && provider.id !== "anonymous") {
        const existingEmailUser = await ctx.db
          .query("users")
          .withIndex("email", q => q.eq("email", profileEmail))
          .first();

        if (existingEmailUser) {
          // Update existing user with latest auth data
          await ctx.db.patch(existingEmailUser._id, {
            name: profileName || existingEmailUser.name,
            email: profileEmail || existingEmailUser.email,
            emailVerified:
              profileEmailVerified || existingEmailUser.emailVerified,
            image: profileImage || existingEmailUser.image,
            isAnonymous: false,
          });

          return existingEmailUser._id;
        }
      }

      // Create new user
      const now = Date.now();

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
