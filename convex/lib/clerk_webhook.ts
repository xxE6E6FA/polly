import { Webhook } from "svix";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MONTHLY_MESSAGE_LIMIT } from "../../shared/constants";
import { cascadeDeleteUserData } from "./user/mutation_handlers";

/**
 * Clerk webhook event types we handle.
 */
interface ClerkUserEvent {
	type: "user.created" | "user.updated" | "user.deleted";
	data: {
		id: string; // Clerk user ID (e.g. "user_2abc...")
		email_addresses?: Array<{
			email_address: string;
			id: string;
			verification?: { status: string };
		}>;
		primary_email_address_id?: string;
		first_name?: string | null;
		last_name?: string | null;
		image_url?: string | null;
	};
}

/**
 * Verify a Clerk webhook request using svix.
 */
export function verifyClerkWebhook(
	payload: string,
	headers: {
		"svix-id": string | null;
		"svix-timestamp": string | null;
		"svix-signature": string | null;
	},
): ClerkUserEvent {
	const secret = process.env.CLERK_WEBHOOK_SECRET;
	if (!secret) {
		throw new Error("CLERK_WEBHOOK_SECRET not configured");
	}

	const wh = new Webhook(secret);
	return wh.verify(payload, {
		"svix-id": headers["svix-id"] ?? "",
		"svix-timestamp": headers["svix-timestamp"] ?? "",
		"svix-signature": headers["svix-signature"] ?? "",
	}) as ClerkUserEvent;
}

/**
 * Extract primary email from Clerk user event data.
 */
function getPrimaryEmail(
	data: ClerkUserEvent["data"],
): string | undefined {
	if (!data.email_addresses || !data.primary_email_address_id) {
		return undefined;
	}
	const primary = data.email_addresses.find(
		(e) => e.id === data.primary_email_address_id,
	);
	return primary?.email_address;
}

/**
 * Build display name from Clerk user data.
 */
function getDisplayName(data: ClerkUserEvent["data"]): string | undefined {
	const parts = [data.first_name, data.last_name].filter(Boolean);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Handle user.created — merge by email or create new user + default settings.
 */
export async function handleClerkUserCreated(
	ctx: MutationCtx,
	data: ClerkUserEvent["data"],
) {
	const externalId = data.id;
	const email = getPrimaryEmail(data);
	const name = getDisplayName(data);
	const image = data.image_url ?? undefined;
	const now = Date.now();

	// Check if a user with this externalId already exists (idempotency)
	const existingByExternalId = await ctx.db
		.query("users")
		.withIndex("byExternalId", (q) => q.eq("externalId", externalId))
		.unique();
	if (existingByExternalId) {
		return existingByExternalId._id;
	}

	// Try email-based merge for existing users (Phase 4 existing user migration)
	if (email) {
		const existingByEmail = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", email))
			.first();

		if (existingByEmail && !existingByEmail.externalId) {
			// Only merge if the existing user has no Clerk identity yet.
			// Prevents account takeover if an attacker registers with a
			// matching email address.
			await ctx.db.patch(existingByEmail._id, {
				externalId,
				name: existingByEmail.name || name,
				image: existingByEmail.image || image,
				isAnonymous: false,
			});
			return existingByEmail._id;
		}
	}

	// Create new user
	const userId = await ctx.db.insert("users", {
		externalId,
		name,
		email,
		image,
		isAnonymous: false,
		createdAt: now,
		messagesSent: 0,
		monthlyMessagesSent: 0,
		monthlyLimit: MONTHLY_MESSAGE_LIMIT,
		lastMonthlyReset: now,
		conversationCount: 0,
		totalMessageCount: 0,
	});

	// Create default user settings (ported from auth.ts afterUserCreatedOrUpdated)
	await ctx.db.insert("userSettings", {
		userId,
		personasEnabled: true,
		openRouterSorting: "default",
		autoArchiveEnabled: false,
		autoArchiveDays: 30,
		createdAt: now,
		updatedAt: now,
	});

	return userId;
}

/**
 * Handle user.updated — patch name/email/image.
 */
export async function handleClerkUserUpdated(
	ctx: MutationCtx,
	data: ClerkUserEvent["data"],
) {
	const externalId = data.id;

	const user = await ctx.db
		.query("users")
		.withIndex("byExternalId", (q) => q.eq("externalId", externalId))
		.unique();

	if (!user) {
		console.warn(
			`[Clerk Webhook] user.updated for unknown externalId ${externalId}`,
		);
		return;
	}

	const email = getPrimaryEmail(data);
	const name = getDisplayName(data);
	const image = data.image_url ?? undefined;

	await ctx.db.patch(user._id, {
		...(email !== undefined && { email }),
		...(name !== undefined && { name }),
		...(image !== undefined && { image }),
	});
}

/**
 * Handle user.deleted — cascade delete all user data.
 */
export async function handleClerkUserDeleted(
	ctx: MutationCtx,
	data: ClerkUserEvent["data"],
) {
	const externalId = data.id;

	const user = await ctx.db
		.query("users")
		.withIndex("byExternalId", (q) => q.eq("externalId", externalId))
		.unique();

	if (!user) {
		console.warn(
			`[Clerk Webhook] user.deleted for unknown externalId ${externalId}`,
		);
		return;
	}

	// Cascade-delete all user data (conversations, messages, settings, etc.)
	await cascadeDeleteUserData(ctx, user._id);
}
