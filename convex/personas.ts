import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOptionalUserId, getCurrentUserId } from "./lib/auth";
import { action } from "./_generated/server";

export const list = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || (await getOptionalUserId(ctx));

    if (!userId) {
      // Return only built-in personas for anonymous users
      return await ctx.db
        .query("personas")
        .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
        .filter(q => q.eq(q.field("isActive"), true))
        .order("asc")
        .collect();
    }

    // Get both built-in and user personas
    const builtInPersonas = await ctx.db
      .query("personas")
      .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();

    const userPersonas = await ctx.db
      .query("personas")
      .withIndex("by_user_active", q =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .collect();

    // Get user's persona settings to filter out disabled built-in personas
    const userPersonaSettings = await ctx.db
      .query("userPersonaSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const disabledPersonaIds = new Set(
      userPersonaSettings
        .filter(setting => setting.isDisabled)
        .map(setting => setting.personaId)
    );

    // Filter out disabled built-in personas
    const enabledBuiltInPersonas = builtInPersonas.filter(
      persona => !disabledPersonaIds.has(persona._id)
    );

    return [...enabledBuiltInPersonas, ...userPersonas].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
  },
});

export const get = query({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    const now = Date.now();

    return await ctx.db.insert("personas", {
      userId: userId || undefined,
      name: args.name,
      description: args.description,
      prompt: args.prompt,
      icon: args.icon,
      isBuiltIn: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("personas"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    prompt: v.optional(v.string()),
    icon: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    const { id, ...updates } = args;

    // Verify ownership (can't edit built-in personas)
    const persona = await ctx.db.get(id);
    if (!persona) {
      throw new Error("Persona not found");
    }

    if (persona.isBuiltIn || persona.userId !== userId) {
      throw new Error("Cannot edit this persona");
    }

    return await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    // Verify ownership (can't delete built-in personas)
    const persona = await ctx.db.get(args.id);
    if (!persona) {
      throw new Error("Persona not found");
    }

    if (persona.isBuiltIn || persona.userId !== userId) {
      throw new Error("Cannot delete this persona");
    }

    return await ctx.db.delete(args.id);
  },
});

export const listAllBuiltIn = query({
  handler: async ctx => {
    return await ctx.db
      .query("personas")
      .withIndex("by_built_in", q => q.eq("isBuiltIn", true))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getUserPersonaSettings = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || (await getOptionalUserId(ctx));
    if (!userId) return [];

    return await ctx.db
      .query("userPersonaSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

export const toggleBuiltInPersona = mutation({
  args: {
    personaId: v.id("personas"),
    isDisabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    // Verify this is a built-in persona
    const persona = await ctx.db.get(args.personaId);
    if (!persona || !persona.isBuiltIn) {
      throw new Error("Can only toggle built-in personas");
    }

    // Check if setting already exists
    const existingSetting = await ctx.db
      .query("userPersonaSettings")
      .withIndex("by_user_persona", q =>
        q.eq("userId", userId).eq("personaId", args.personaId)
      )
      .first();

    const now = Date.now();

    if (existingSetting) {
      // Update existing setting
      await ctx.db.patch(existingSetting._id, {
        isDisabled: args.isDisabled,
        updatedAt: now,
      });
    } else {
      // Create new setting
      await ctx.db.insert("userPersonaSettings", {
        userId,
        personaId: args.personaId,
        isDisabled: args.isDisabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

export const improvePrompt = action({
  args: {
    prompt: v.string(),
  },
  handler: async (_, args): Promise<{ improvedPrompt: string }> => {
    const systemPrompt = `You are a system prompt improvement assistant. Take the user's initial prompt and transform it into a more detailed, structured system prompt for an AI assistant.

Follow these guidelines:
1. Maintain the core intent and personality of the original prompt
2. Add specific instructions about tone, behavior, and expertise
3. Include examples of how to respond when helpful
4. Structure the prompt clearly with sections if needed
5. Keep it concise but comprehensive (aim for 200-400 words)
6. Use second person ("You are...", "You should...")

Return ONLY the improved prompt text, no explanations or metadata.`;

    const userPrompt = `Improve this system prompt for an AI assistant persona:\n\n${args.prompt}`;

    try {
      const openAIKey = process.env.OPENAI_API_KEY;

      if (!openAIKey) {
        throw new Error("OpenAI API key not configured");
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAIKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 1000,
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as {
          error?: { message?: string };
        };
        console.error("OpenAI API error:", error);
        throw new Error(error.error?.message || "Failed to improve prompt");
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const improvedPrompt = data.choices?.[0]?.message?.content?.trim();

      if (!improvedPrompt) {
        throw new Error("No improvement generated");
      }

      return { improvedPrompt };
    } catch (error) {
      console.error("Error improving prompt:", error);
      throw error;
    }
  },
});
