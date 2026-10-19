// GENERATED from nova-terra tools/design-bridge/src/engine/registry.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Generic registry: component tags, props, slots and chrome built from a live snapshot plus an
// optional profile (design §6; context D5-D7). Pure: no module state, no I/O.

import { JsxError } from "./errors";
import type { Chrome, Node, Platform, TextValue } from "./ir/schema";
import { camelCase, canonicalTag, lastSegment, suggest } from "./naming";
import type { Profile } from "./profile";
import type { LiveSet, LiveSnapshot } from "./snapshot";

export type ChromePart = "statusBar" | "navBar" | "tabBar" | "gesture";

export interface RegistryComponent {
	/** Canonical tag (`Button`, `Forms.TextField`). */
	tag: string;
	set: string;
	/** Flat aliases usable in source (the last segment, while unique). */
	aliases: string[];
	library?: string;
	libraryId?: string;
	group: LiveSet;
	/** DSL prop key -> Penpot property. */
	propKeys: Record<string, string>;
	/** Slot alias -> text layer reference (the layer name; `name#2` is the second layer of that name). */
	slots: Record<string, string>;
	/** Penpot property -> value used when the prop is omitted. */
	defaults: Record<string, string>;
	/** The profile fixed this set's defaults: omitted props without a default are required. */
	authoritative: boolean;
}

export interface RegistryChrome {
	set: string;
	platform: Platform;
	part: ChromePart;
	group: LiveSet;
	propKeys: Record<string, string>;
	defaults: Record<string, string>;
}

export interface Size {
	width: number;
	height: number;
}

export interface Registry {
	/** Canonical tag -> component. Chrome sets are not components. */
	components: Record<string, RegistryComponent>;
	/** Flat alias -> canonical tag. */
	aliases: Record<string, string>;
	/** A name that is the last segment of several tags and no tag itself -> those tags. */
	ambiguous: Record<string, string[]>;
	chrome: RegistryChrome[];
	/** Every set of the snapshot by name (components and chrome); prepare picks exact variants here. */
	sets: Map<string, LiveSet>;
	/** Per-platform screen size: the profile's, else from the snapshot boards named `<Platform> · ...`. */
	presets: Partial<Record<Platform, Size>>;
	warnings: string[];
}

const PLATFORM_PREFIX: Record<string, Platform> = { Web: "web", iOS: "ios", Android: "android" };

function platformPresets(snap: LiveSnapshot, profile: Profile | undefined): Registry["presets"] {
	const out: Registry["presets"] = {};
	for (const b of snap.presets) {
		const prefix = b.name.split(" · ")[0] ?? "";
		const platform = PLATFORM_PREFIX[prefix];
		if (platform && !out[platform] && b.name.includes(" · ")) {
			out[platform] = { width: b.width, height: b.height };
		}
	}
	return { ...out, ...(profile?.presets ?? {}) };
}

function propKeysOf(group: LiveSet): Record<string, string> {
	return Object.fromEntries(group.properties.map((p) => [camelCase(p), p]));
}

/** Layer references of one variant, in tree order: the 2nd layer named `label` is `label#2`. */
function layerRefs(textSlots: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return textSlots.map((name) => {
		const n = (seen.get(name) ?? 0) + 1;
		seen.set(name, n);
		return n === 1 ? name : `${name}#${n}`;
	});
}

/** Splits a layer reference into its name and 1-based ordinal. */
export function parseLayerRef(ref: string): { name: string; ordinal: number } {
	const m = /^(.*)#(\d+)$/.exec(ref);
	return m && Number(m[2]) >= 2 ? { name: m[1]!, ordinal: Number(m[2]) } : { name: ref, ordinal: 1 };
}

const RESERVED_PROPS = ["id", "children", "className"];

function deriveSlots(group: LiveSet, propKeys: Record<string, string>): Record<string, string> {
	const refs: string[] = [];
	for (const v of group.variants) {
		for (const r of layerRefs(v.textSlots ?? [])) if (!refs.includes(r)) refs.push(r);
	}
	// Reserved prop names never become slot aliases.
	const taken = new Set([...Object.keys(propKeys), ...RESERVED_PROPS]);
	const slots: Record<string, string> = {};
	for (const ref of refs) {
		const { name, ordinal } = parseLayerRef(ref);
		const base = camelCase(name) || "text";
		let alias = ordinal === 1 ? base : `${base}_${ordinal}`;
		if (taken.has(alias)) alias = `${alias}Text`;
		for (let n = 2; taken.has(alias); n++) alias = `${base}Text_${n}`;
		taken.add(alias);
		slots[alias] = ref;
	}
	return slots;
}

function firstVariantDefaults(group: LiveSet): Record<string, string> {
	const first = group.variants[0];
	if (!first) return {};
	return Object.fromEntries(
		group.properties.filter((p) => first.variantProps[p] !== undefined).map((p) => [p, first.variantProps[p]!]),
	);
}

export function buildRegistry(snap: LiveSnapshot, profile?: Profile): Registry {
	const warnings: string[] = [];
	const sets = new Map(snap.sets.map((g) => [g.set, g]));
	const chromeSets = new Set((profile?.chrome ?? []).map((c) => c.set));

	const chrome: RegistryChrome[] = [];
	for (const c of profile?.chrome ?? []) {
		const group = sets.get(c.set);
		if (!group) {
			warnings.push(`profile chrome set "${c.set}" is not in the snapshot; skipped`);
			continue;
		}
		const defaults = profile?.defaults?.[c.set] ?? firstVariantDefaults(group);
		chrome.push({ set: c.set, platform: c.platform, part: c.part, group, propKeys: propKeysOf(group), defaults: { ...defaults } });
	}

	// Tags: profile alias, else canonical; collisions get _2, _3 in snapshot order.
	const used = new Set<string>();
	const entries: { group: LiveSet; tag: string; override: boolean }[] = [];
	for (const group of snap.sets) {
		if (chromeSets.has(group.set)) continue;
		const override = profile?.aliases?.[group.set];
		const base = override ?? canonicalTag(group.set);
		let tag = base;
		for (let n = 2; used.has(tag); n++) tag = `${base}_${n}`;
		if (tag !== base) warnings.push(`set "${group.set}" maps to tag ${base}, already taken; renamed ${tag}`);
		used.add(tag);
		entries.push({ group, tag, override: override !== undefined });
	}

	// Flat aliases: the last segment, only while no other tag shares it.
	const lastCount = new Map<string, number>();
	for (const e of entries) lastCount.set(lastSegment(e.tag), (lastCount.get(lastSegment(e.tag)) ?? 0) + 1);

	const components: Registry["components"] = {};
	const aliases: Registry["aliases"] = {};
	const ambiguous: Registry["ambiguous"] = {};
	for (const e of entries) {
		const { group, tag } = e;
		const propKeys = propKeysOf(group);
		const slotProfile = profile?.slotAliases?.[group.set];
		const defaultsProfile = profile?.defaults?.[group.set];
		const comp: RegistryComponent = {
			tag,
			set: group.set,
			aliases: [],
			group,
			propKeys,
			slots: slotProfile ? { ...slotProfile } : deriveSlots(group, propKeys),
			defaults: { ...(defaultsProfile ?? firstVariantDefaults(group)) },
			authoritative: defaultsProfile !== undefined,
		};
		if (group.library !== undefined) comp.library = group.library;
		if (group.libraryId !== undefined) comp.libraryId = group.libraryId;
		components[tag] = comp;
	}
	for (const e of entries) {
		const last = lastSegment(e.tag);
		if (e.tag === last || e.override) continue;
		if (Object.hasOwn(components, last)) {
			warnings.push(`alias ${last} for tag ${e.tag} is omitted: ${last} is already the tag of "${components[last]!.set}"`);
		} else if (lastCount.get(last) === 1) {
			aliases[last] = e.tag;
			components[e.tag]!.aliases.push(last);
		} else {
			(ambiguous[last] ??= []).push(e.tag);
		}
	}
	// A component tag that is also a namespace root cannot be both in scope.
	for (const tag of Object.keys(components)) {
		const root = tag.split(".")[0]!;
		if (root !== tag && Object.hasOwn(components, root)) {
			warnings.push(`tag ${root} is both a component and the namespace of ${tag}; use the dotted tag`);
		}
	}

	return { components, aliases, ambiguous, chrome, sets, presets: platformPresets(snap, profile), warnings };
}

/** What the plugin evaluator injects into scope (design §2.3). */
export interface EvalScope {
	/** Flat names usable without import: single-segment tags and unique aliases. */
	tags: string[];
	/** Namespace root -> the dotted remainders (`IOS` -> [`StatusBar`]). */
	namespaces: Record<string, string[]>;
	importSpecifiers: string[];
}

export const BASE_IMPORT = "@penpot/jsx";

export function importSpecifiers(profile?: Profile): string[] {
	const roots = [BASE_IMPORT, ...(profile?.importAliases ?? [])];
	return roots.flatMap((r) => [r, `${r}/jsx-runtime`, `${r}/jsx-dev-runtime`]);
}

export function scopeOf(reg: Registry, profile?: Profile): EvalScope {
	const tags = new Set<string>();
	const namespaces: Record<string, string[]> = {};
	for (const tag of Object.keys(reg.components)) {
		const dot = tag.indexOf(".");
		if (dot < 0) tags.add(tag);
		else (namespaces[tag.slice(0, dot)] ??= []).push(tag.slice(dot + 1));
	}
	for (const alias of Object.keys(reg.aliases)) tags.add(alias);
	return { tags: [...tags], namespaces, importSpecifiers: importSpecifiers(profile) };
}

function list(values: readonly string[]): string {
	return values.map((v) => `"${v}"`).join(", ");
}

function validTags(reg: Registry): string {
	const tags = Object.keys(reg.components);
	return tags.length > 24 ? `${tags.slice(0, 24).join(", ")}, ...(+${tags.length - 24})` : tags.join(", ");
}

/** Finds a component by canonical tag or flat alias; unknown and ambiguous tags are errors. */
export function resolveTag(reg: Registry, name: string): RegistryComponent {
	if (Object.hasOwn(reg.components, name)) return reg.components[name]!;
	if (Object.hasOwn(reg.aliases, name)) return reg.components[reg.aliases[name]!]!;
	if (Object.hasOwn(reg.ambiguous, name)) {
		const options = reg.ambiguous[name]!;
		throw new JsxError("JSX_AMBIGUOUS_TAG", `<${name}> matches ${options.join(", ")}; use the full tag`, { valid: options });
	}
	const close = suggest(name, [...Object.keys(reg.components), ...Object.keys(reg.aliases)], 1);
	const did = close.length > 0 ? ` Did you mean <${close[0]}>?` : "";
	throw new JsxError("JSX_UNKNOWN_COMPONENT", `<${name}> is not a component in this file.${did} Valid: ${validTags(reg)}`, {
		valid: Object.keys(reg.components),
	});
}

export type ComponentInput = Record<string, unknown> & { id?: string };

function toSlot(tag: string, alias: string, v: unknown): TextValue {
	if (typeof v === "string") return { literal: v };
	if (typeof v === "object" && v !== null && ("key" in v || "literal" in v)) return v as TextValue;
	throw new JsxError("JSX_INVALID_VALUE", `<${tag}> slot "${alias}" must be a string or t() value`);
}

export interface BuildComponentOptions {
	/** Every prop without a profile default is required; a slot absent from the variant is an error. */
	strict?: boolean;
	warn?: (message: string) => void;
}

function diffCount(a: Record<string, string>, b: Record<string, string>, keys: readonly string[]): number {
	return keys.filter((k) => a[k] !== b[k]).length;
}

function formatCombo(props: Record<string, string>, keys: readonly string[]): string {
	return `{${keys.map((k) => `${k}: ${props[k]}`).join(", ")}}`;
}

/** Up to `limit` existing combinations that differ from `wanted` in the fewest props. */
export function nearestCombinations(group: LiveSet, wanted: Record<string, string>, limit = 5): string[] {
	const keys = group.properties;
	return group.variants
		.map((v, i) => ({ v, i, d: diffCount(v.variantProps, wanted, keys) }))
		.sort((a, b) => a.d - b.d || a.i - b.i)
		.slice(0, limit)
		.map((x) => formatCombo(x.v.variantProps, keys));
}

function hasLayer(textSlots: readonly string[], ref: string): boolean {
	const { name, ordinal } = parseLayerRef(ref);
	return textSlots.filter((s) => s === name).length >= ordinal;
}

/** Validates props against the registry and builds the IR component node (design §6). */
export function buildComponent(
	reg: Registry,
	tag: string,
	props: ComponentInput,
	opts: BuildComponentOptions = {},
): Extract<Node, { kind: "component" }> {
	const comp = resolveTag(reg, tag);
	const { set, slots: slotMap, defaults, group } = comp;
	const variant: Record<string, string> = { ...defaults };
	const explicit = new Set<string>();
	const slots: Record<string, TextValue> = {};
	for (const [key, value] of Object.entries(props)) {
		if (key === "id" || value === undefined) continue;
		if (key === "children") {
			opts.warn?.(`<${tag}> children are ignored; pass copy through slot props`);
			continue;
		}
		const penpotProp = Object.hasOwn(comp.propKeys, key) ? comp.propKeys[key] : undefined;
		if (penpotProp !== undefined) {
			const valid = group.values[penpotProp] ?? [];
			if (typeof value !== "string" || !valid.includes(value)) {
				const close = typeof value === "string" ? suggest(value, valid, 1)[0] : undefined;
				const did = close === undefined ? "" : ` Did you mean ${JSON.stringify(close)}?`;
				throw new JsxError(
					"JSX_INVALID_VALUE",
					`<${tag}> ${key}=${JSON.stringify(value)} is not a value of "${set}"."${penpotProp}".${did} Valid: ${list(valid)}`,
					{ valid: [...valid], ...(close === undefined ? {} : { hint: `Did you mean ${JSON.stringify(close)}?` }) },
				);
			}
			variant[penpotProp] = value;
			explicit.add(penpotProp);
		} else if (Object.hasOwn(slotMap, key)) {
			slots[slotMap[key]!] = toSlot(tag, key, value);
		} else {
			const names = [...Object.keys(comp.propKeys), ...Object.keys(slotMap)];
			const close = suggest(key, names, 1)[0];
			const did = close === undefined ? "" : ` Did you mean "${close}"?`;
			throw new JsxError(
				"JSX_INVALID_PROP",
				`<${tag}> has no prop or slot "${key}".${did} Props: ${list(Object.keys(comp.propKeys))}. Slots: ${list(Object.keys(slotMap))}`,
				{ valid: names, ...(close === undefined ? {} : { hint: `Did you mean "${close}"?` }) },
			);
		}
	}
	for (const p of group.properties) {
		const fixedByProfile = comp.authoritative && defaults[p] !== undefined;
		if (variant[p] === undefined || (opts.strict === true && !explicit.has(p) && !fixedByProfile)) {
			throw new JsxError("JSX_MISSING_PROP", `<${tag}> requires prop "${camelCase(p)}". Valid: ${list(group.values[p] ?? [])}`, {
				valid: [...(group.values[p] ?? [])],
			});
		}
	}
	const match = group.variants.find((v) => group.properties.every((p) => v.variantProps[p] === variant[p]));
	if (group.variants.length > 0 && !match) {
		const shown = group.properties.map((p) => `${camelCase(p)}=${JSON.stringify(variant[p])}`).join(" ");
		const closest = nearestCombinations(group, variant);
		throw new JsxError("JSX_INVALID_VARIANT", `<${tag}${shown ? ` ${shown}` : ""}> has no variant. Closest: ${closest.join(", ")}`, {
			valid: closest,
		});
	}
	if (match?.textSlots) {
		for (const layer of Object.keys(slots)) {
			if (hasLayer(match.textSlots, layer)) continue;
			const alias = Object.keys(slotMap).find((a) => slotMap[a] === layer) ?? layer;
			const msg = `slot "${alias}" has no text layer in variant ${formatCombo(variant, group.properties)}`;
			if (opts.strict === true) throw new JsxError("JSX_UNKNOWN_SLOT", `<${tag}> ${msg}`);
			opts.warn?.(`<${tag}> ${msg}`);
		}
	}
	const node: Extract<Node, { kind: "component" }> = { kind: "component", set, variant, slots };
	if (typeof props.id === "string") node.id = props.id;
	return node;
}

const TOP: ChromePart[] = ["statusBar", "navBar"];
const BOTTOM: ChromePart[] = ["tabBar", "gesture"];

/** Expands `Screen.chrome` flags into chrome component nodes, split top / bottom. */
export function expandChrome(reg: Registry, platform: Platform, flags: Chrome): { top: Node[]; bottom: Node[] } {
	const make = (part: ChromePart): Node[] => {
		if (!flags[part]) return [];
		const c = reg.chrome.find((x) => x.platform === platform && x.part === part);
		if (!c) {
			throw new JsxError("JSX_INVALID_PROP", `no ${part} chrome component for platform "${platform}"`);
		}
		return [{ kind: "component", set: c.set, variant: { ...c.defaults }, slots: {} }];
	};
	return { top: TOP.flatMap(make), bottom: BOTTOM.flatMap(make) };
}
