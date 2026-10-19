// GENERATED from nova-terra tools/design-bridge/src/engine/push/render-model.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Pure render model shared by the engine (prepare), the CLI and the Penpot plugin bundle:
// the resolved-node types, variant matching and page-name rules. No Node APIs, no runtime imports.

import type { LayoutChild, Platform } from "../ir/schema";

/** Trim, collapse whitespace (NBSP included) and lowercase, for page-name comparison. */
export function normalizePageName(name: string): string {
	return name.replace(/[\s ]+/g, " ").trim().toLowerCase();
}

/** True when `name` equals any guard after normalization. */
export function isForbiddenPage(name: string, guards: readonly string[]): boolean {
	const n = normalizePageName(name);
	return guards.some((g) => normalizePageName(g) === n);
}


/** A resolved text: i18n key and params are kept so the plugin can tag the layer. */
export interface RText {
	key?: string;
	params?: Record<string, string | number>;
	text: string;
}

/** A Penpot token name with the raw value to fall back on when the token is missing (R3.8). */
export interface RToken {
	name: string;
	raw?: string | number;
}

export interface RDim {
	px: number;
	/** Penpot spacing token name, when the author used a token. */
	token?: string;
}

export interface RLayout {
	dir: "column" | "row" | "none";
	gap?: RDim;
	padding?: [RDim, RDim, RDim, RDim];
	align?: "start" | "center" | "end" | "stretch";
	justify?: "start" | "center" | "end" | "between";
	wrap?: boolean;
}

export interface RStyle {
	fill?: RToken;
	stroke?: RToken;
	radius?: RToken;
	shadow?: RToken;
}

export type RNode =
	| {
			kind: "frame";
			nodeId: string;
			name?: string;
			layout: RLayout;
			style: RStyle;
			layoutChild?: LayoutChild;
			children: RNode[];
	  }
	| {
			kind: "text";
			nodeId: string;
			text: RText;
			style: RStyle;
			layoutChild?: LayoutChild;
	  }
	| {
			kind: "component";
			nodeId: string;
			set: string;
			/** Snapshot componentId of the exact variant (R3.2). */
			componentId: string;
			/** Library the component lives in (local or connected); absent for single-library snapshots. */
			libraryId?: string;
			variant: Record<string, string>;
			/** Text layer name -> resolved text. */
			slots: Record<string, RText>;
			layoutChild?: LayoutChild;
	  };

export interface RScreen {
	id: string;
	platform: Platform;
	title: string;
	/** Board name, free of "/". */
	name: string;
	width: number;
	height: number;
	layout: RLayout;
	children: RNode[];
}

/** Penpot names must not contain "/" (it splits paths). */
export function safeName(name: string): string {
	return name.replace(/\s*\/\s*/g, " · ");
}

export interface VariantEntry {
	componentId: string;
	variantProps: Record<string, string>;
}

function matchCount(a: Record<string, string>, b: Record<string, string>): number {
	return Object.entries(a).filter(([k, v]) => b[k] === v).length;
}

function sameProps(a: Record<string, string>, b: Record<string, string>): boolean {
	const ak = Object.keys(a);
	return ak.length === Object.keys(b).length && matchCount(a, b) === ak.length;
}

/**
 * R3.2: the variant whose `variantProps` equals `wanted` exactly. No exact match
 * fails with the closest candidates; a variant is never picked silently.
 */
export function matchVariant(
	set: string,
	variants: readonly VariantEntry[],
	wanted: Record<string, string>,
): VariantEntry {
	const exact = variants.filter((v) => sameProps(v.variantProps, wanted));
	if (exact.length === 1) return exact[0]!;
	if (exact.length > 1) {
		throw new Error(`design-bridge: "${set}" has ${exact.length} variants for ${JSON.stringify(wanted)}`);
	}
	const closest = [...variants]
		.sort((a, b) => matchCount(wanted, b.variantProps) - matchCount(wanted, a.variantProps))
		.slice(0, 3)
		.map((v) => JSON.stringify(v.variantProps));
	throw new Error(
		`design-bridge: no variant of "${set}" matches ${JSON.stringify(wanted)}. Closest: ${closest.join("; ") || "(none)"}`,
	);
}

