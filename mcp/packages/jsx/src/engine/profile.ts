// GENERATED from nova-terra tools/design-bridge/src/engine/profile.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Optional profile layer (context D9): keeps one team's naming and defaults out of the generic engine.

import { z } from "zod";
import { JsxError } from "./errors";

const Platform = z.enum(["web", "ios", "android"]);
const Size = z.object({ width: z.number(), height: z.number() });

export const ProfileSchema = z
	.object({
		/** Extra import specifiers the source may use (besides `@penpot/jsx`). */
		importAliases: z.array(z.string()).optional(),
		/** Set name -> canonical tag; replaces the derived tag and drops the flat alias. */
		aliases: z.record(z.string(), z.string()).optional(),
		/** Set name -> (slot alias -> text layer name). */
		slotAliases: z.record(z.string(), z.record(z.string(), z.string())).optional(),
		/**
		 * Set name -> (Penpot property -> value). A set listed here is authoritative: properties
		 * missing from it are required, instead of falling back to the first variant.
		 */
		defaults: z.record(z.string(), z.record(z.string(), z.string())).optional(),
		/** Sets that are chrome (selected by `Screen.chrome` flags, not authored by hand). */
		chrome: z.array(z.object({ set: z.string(), platform: Platform, part: z.enum(["statusBar", "navBar", "tabBar", "gesture"]) })).optional(),
		/** Per-platform screen size; overrides the sizes derived from the snapshot boards. */
		presets: z.partialRecord(Platform, Size).optional(),
		/** Class key -> Penpot token name; wins over keys derived from the catalog. */
		tokenAliases: z.record(z.string(), z.string()).optional(),
		forbiddenPages: z.array(z.string()).optional(),
		defaultPage: z.string().optional(),
		/** Shared-plugin-data namespace (default `penpot-jsx`). */
		sharedNs: z.string().optional(),
	})
	.strict();

export type Profile = z.infer<typeof ProfileSchema>;

export function parseProfile(raw: unknown): Profile {
	const r = ProfileSchema.safeParse(raw);
	if (!r.success) throw new JsxError("PROFILE_INVALID", `profile is invalid: ${r.error.message}`);
	return r.data;
}

/** Guards from the environment/args plus the profile: a call can only add guards, never remove. */
export function mergeGuards(profile: Profile | undefined, extra: readonly string[] = []): string[] {
	return [...new Set([...(profile?.forbiddenPages ?? []), ...extra])];
}
