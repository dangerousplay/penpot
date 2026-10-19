// GENERATED from nova-terra tools/design-bridge/src/engine/theme.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Theme: the closed set of class keys (colors, spacing, radius, shadow) the Tailwind subset may use,
// each bound to a Penpot token name (design §7). Derived from the live token catalog, or from code
// tokens by a consumer (the Nova Terra adapter). Pure data; no module state.

import type { Profile } from "./profile";
import type { TokenCatalog } from "./snapshot";

export interface ThemeColor {
	/** Raw value used as the fallback when the token is missing in the target file. */
	value?: string;
	token: string;
}

export interface ThemeNumber {
	value: number;
	token: string;
}

export interface ThemeShadow {
	token: string;
}

export type ThemeFamily = "colors" | "spacing" | "radius" | "shadow";

export interface ThemeCollision {
	family: ThemeFamily;
	key: string;
	/** Token name that won (the later active set). */
	kept: string;
	dropped: string;
}

export interface Theme {
	colors: Record<string, ThemeColor>;
	spacing: Record<string, ThemeNumber>;
	radius: Record<string, ThemeNumber>;
	shadow: Record<string, ThemeShadow>;
	collisions: ThemeCollision[];
}

export function emptyTheme(): Theme {
	return { colors: {}, spacing: {}, radius: {}, shadow: {}, collisions: [] };
}

const NUMERIC = /^-?\d+(?:\.\d+)?(?:px)?$/;

function toNumber(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && NUMERIC.test(v.trim())) return Number.parseFloat(v);
	return undefined;
}

function toColor(v: unknown): string | undefined {
	return typeof v === "string" && !v.startsWith("{") ? v : undefined;
}

function dropLeading(name: string, families: readonly string[]): string[] {
	const parts = name.split(".");
	if (parts.length > 1 && families.includes(parts[0]!)) parts.shift();
	return parts;
}

/** Tokens of the active sets, in catalog order: active themes' `activeSets` when any, else every active set. */
export function activeTokens(cat: TokenCatalog): { name: string; type: string; value: unknown; resolvedValue?: unknown }[] {
	const activeThemes = cat.themes.filter((t) => t.active);
	const names = activeThemes.length > 0 ? new Set(activeThemes.flatMap((t) => t.activeSets)) : undefined;
	return cat.sets
		.filter((s) => (names ? names.has(s.name) : s.active))
		.flatMap((s) => s.tokens);
}

type Tok = ReturnType<typeof activeTokens>[number];

function familyOf(tok: Tok): ThemeFamily | undefined {
	const head = tok.name.split(".")[0];
	switch (tok.type) {
		case "color":
			return "colors";
		case "spacing":
			return "spacing";
		case "dimension":
			return head === "spacing" || head === "space" ? "spacing" : undefined;
		case "borderRadius":
			return "radius";
		case "shadow":
			return "shadow";
		default:
			return undefined;
	}
}

function keyOf(family: ThemeFamily, name: string): string {
	switch (family) {
		case "colors":
			return dropLeading(name, ["color", "colors"]).join("-");
		case "spacing":
			return dropLeading(name, ["spacing", "space"]).join("-");
		case "radius":
			return dropLeading(name, ["radius", "radii", "borderRadius"]).join("-");
		case "shadow":
			return dropLeading(name, ["shadow", "shadows"]).join("-");
	}
}

function put(theme: Theme, family: ThemeFamily, key: string, tok: Tok, collide: boolean): void {
	const value = tok.resolvedValue ?? tok.value;
	switch (family) {
		case "colors": {
			const raw = toColor(value);
			const prev = theme.colors[key];
			if (collide && prev && prev.token !== tok.name) theme.collisions.push({ family, key, kept: tok.name, dropped: prev.token });
			theme.colors[key] = raw === undefined ? { token: tok.name } : { value: raw, token: tok.name };
			return;
		}
		case "spacing":
		case "radius": {
			const n = toNumber(value);
			if (n === undefined) return;
			const prev = theme[family][key];
			if (collide && prev && prev.token !== tok.name) theme.collisions.push({ family, key, kept: tok.name, dropped: prev.token });
			theme[family][key] = { value: n, token: tok.name };
			return;
		}
		case "shadow": {
			const prev = theme.shadow[key];
			if (collide && prev && prev.token !== tok.name) theme.collisions.push({ family, key, kept: tok.name, dropped: prev.token });
			theme.shadow[key] = { token: tok.name };
			return;
		}
	}
}

/** Theme from the live token catalog; profile `tokenAliases` (class key -> token name) win over derived keys. */
export function themeFromTokens(cat: TokenCatalog, profile?: Profile): Theme {
	const theme = emptyTheme();
	const tokens = activeTokens(cat);
	for (const tok of tokens) {
		const family = familyOf(tok);
		if (!family) continue;
		const key = keyOf(family, tok.name);
		if (key.length === 0) continue;
		put(theme, family, key, tok, true);
	}
	for (const [classKey, tokenName] of Object.entries(profile?.tokenAliases ?? {})) {
		const tok = [...tokens].reverse().find((t) => t.name === tokenName);
		const family = tok ? familyOf(tok) : undefined;
		if (tok && family) put(theme, family, classKey, tok, false);
	}
	return theme;
}

export interface CodeTokens {
	colors: Readonly<Record<string, string>>;
	/** Skeleton colors; their class keys are namespaced `skeleton-<key>`. */
	skeleton?: Readonly<Record<string, string>>;
	spacing: Readonly<Record<string, number>>;
	radius: Readonly<Record<string, number>>;
	shadow: Readonly<Record<string, unknown>>;
}

export type CodeTokenGroup = "colors" | "skeleton" | "spacing" | "radius" | "shadow";

/** Theme from code-owned tokens (a consumer supplies the key -> Penpot token name mapping). */
export function themeFromCode(src: CodeTokens, tokenName: (group: CodeTokenGroup, key: string) => string): Theme {
	const theme = emptyTheme();
	for (const [k, v] of Object.entries(src.colors)) theme.colors[k] = { value: v, token: tokenName("colors", k) };
	for (const [k, v] of Object.entries(src.skeleton ?? {})) {
		theme.colors[`skeleton-${k}`] = { value: v, token: tokenName("skeleton", k) };
	}
	for (const [k, v] of Object.entries(src.spacing)) theme.spacing[k] = { value: v, token: tokenName("spacing", k) };
	for (const [k, v] of Object.entries(src.radius)) theme.radius[k] = { value: v, token: tokenName("radius", k) };
	for (const k of Object.keys(src.shadow)) theme.shadow[k] = { token: tokenName("shadow", k) };
	return theme;
}
