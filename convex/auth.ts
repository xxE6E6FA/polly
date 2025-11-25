import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, invalidateSessions } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { MONTHLY_MESSAGE_LIMIT } from "../shared/constants";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId:
        process.env.AUTH_GOOGLE_ID ??
        (() => {
          throw new Error("AUTH_GOOGLE_ID environment variable is required");
        })(),
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET ??
        (() => {
          throw new Error(
            "AUTH_GOOGLE_SECRET environment variable is required"
          );
        })(),
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    Anonymous,
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
    async createOrUpdateUser(ctx, args) {
      const typedCtx = ctx as unknown as MutationCtx;
      const { existingUserId, profile, provider } = args;

      // Access existingSessionId from the full args object
      // biome-ignore lint/suspicious/noExplicitAny: Convex Auth doesn't export full type
      const existingSessionId = (args as any).existingSessionId;

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

      // If transitioning from anonymous to OAuth, invalidate the old anonymous session
      // to prevent "Invalid refresh token" errors when the old session tries to refresh
      if (
        existingSessionId &&
        provider.id !== "anonymous" &&
        args.type === "oauth"
      ) {
        try {
          // Get the session to check if it belongs to an anonymous user
          const session = await typedCtx.db.get(
            existingSessionId as Id<"authSessions">
          );
          if (session) {
            const sessionUser = await typedCtx.db.get(
              session.userId as Id<"users">
            );

            // Only invalidate if the session belongs to an anonymous user
            if (sessionUser?.isAnonymous) {
              // Invalidate all sessions for this anonymous user using Convex Auth's API
              // biome-ignore lint/suspicious/noExplicitAny: Convex Auth doesn't export proper type for ctx
              await invalidateSessions(ctx as any, { userId: session.userId });
            }
          }
        } catch (_error) {
          // Silently fail - don't block authentication if session cleanup fails
        }
      }

      // Update existing user
      if (existingUserId) {
        const existingUserDocId = existingUserId as Id<"users">;
        const existingUser = await typedCtx.db.get(existingUserDocId);
        if (!existingUser) {
          console.error(
            `User document ${existingUserId} doesn't exist (orphaned account)`
          );
          throw new ConvexError("User account is in an invalid state");
        }

        // Only update fields that the user hasn't customized
        // On subsequent sign-ins, preserve user's custom name/image
        await typedCtx.db.patch(existingUserDocId, {
          // Only set name/image if they don't exist yet (first sign-in)
          name: existingUser.name || profileName,
          image: existingUser.image || profileImage,
          // Always update email and verification status
          email: profileEmail || existingUser.email,
          emailVerified: profileEmailVerified || existingUser.emailVerified,
          isAnonymous: false,
        });

        return existingUserDocId;
      }

      // Check if there's an existing user with the same email (for email-based providers)
      if (profileEmail && provider.id !== "anonymous") {
        const existingEmailUser = await typedCtx.db
          .query("users")
          .withIndex("email", q => q.eq("email", profileEmail))
          .first();

        if (existingEmailUser) {
          const existingEmailUserId = existingEmailUser._id as Id<"users">;
          // Only update fields that the user hasn't customized
          // On subsequent sign-ins, preserve user's custom name/image
          await typedCtx.db.patch(existingEmailUserId, {
            // Only set name/image if they don't exist yet (first sign-in)
            name: existingEmailUser.name || profileName,
            image: existingEmailUser.image || profileImage,
            // Always update email and verification status
            email: profileEmail || existingEmailUser.email,
            emailVerified:
              profileEmailVerified || existingEmailUser.emailVerified,
            isAnonymous: false,
          });

          return existingEmailUserId;
        }
      }

      // Create new user
      const now = Date.now();

      // Create new user document
      const userId = await typedCtx.db.insert("users", {
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

      return userId as Id<"users">;
    },

    // Additional callback after user is created/updated
    async afterUserCreatedOrUpdated(ctx, args) {
      const typedCtx = ctx as unknown as MutationCtx;
      const { userId, existingUserId, type } = args;
      const userDocId = userId as Id<"users">;

      if (!existingUserId && type !== "verification") {
        const existingSettings = await typedCtx.db
          .query("userSettings")
          .withIndex("by_user", q => q.eq("userId", userDocId))
          .first();

        if (!existingSettings) {
          await typedCtx.db.insert("userSettings", {
            userId: userDocId,
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
