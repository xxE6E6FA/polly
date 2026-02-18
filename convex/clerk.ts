import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  handleClerkUserCreated,
  handleClerkUserDeleted,
  handleClerkUserUpdated,
} from "./lib/clerk_webhook";

/**
 * Internal mutations called by the Clerk webhook HTTP handler.
 * Not exposed to clients.
 */
export const handleWebhookUserCreated = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    primaryEmailAddressId: v.optional(v.string()),
    emailAddresses: v.optional(
      v.array(
        v.object({
          email_address: v.string(),
          id: v.string(),
        })
      )
    ),
  },
  handler: (ctx, args) => {
    return handleClerkUserCreated(ctx, {
      id: args.clerkUserId,
      email_addresses: args.emailAddresses,
      primary_email_address_id: args.primaryEmailAddressId,
      first_name: args.firstName,
      last_name: args.lastName,
      image_url: args.imageUrl,
    });
  },
});

export const handleWebhookUserUpdated = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    primaryEmailAddressId: v.optional(v.string()),
    emailAddresses: v.optional(
      v.array(
        v.object({
          email_address: v.string(),
          id: v.string(),
        })
      )
    ),
  },
  handler: (ctx, args) => {
    return handleClerkUserUpdated(ctx, {
      id: args.clerkUserId,
      email_addresses: args.emailAddresses,
      primary_email_address_id: args.primaryEmailAddressId,
      first_name: args.firstName,
      last_name: args.lastName,
      image_url: args.imageUrl,
    });
  },
});

export const handleWebhookUserDeleted = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: (ctx, args) => {
    return handleClerkUserDeleted(ctx, { id: args.clerkUserId });
  },
});
