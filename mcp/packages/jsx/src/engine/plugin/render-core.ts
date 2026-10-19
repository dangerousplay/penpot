// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/render-core.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Pure render model and helpers shared by the engine (compose side) and the Penpot plugin
// runtime (render.ts). No Node APIs, no `penpot` global, no runtime imports beyond the engine:
// this file is bundled into the plugin IIFE and unit-tested with plain objects.

import type { LayoutChild, Platform } from "../ir/schema";
import type { RLayout, RNode } from "../push/render-model";

export { isForbiddenPage, matchVariant, normalizePageName, safeName } from "../push/render-model";
export type {
	RDim,
	RLayout,
	RNode,
	RScreen,
	RStyle,
	RText,
	RToken,
	VariantEntry,
} from "../push/render-model";

/** Height a frame keeps when the author gave none (the pull reader treats it as "unset"). */
export const PRESET_HEIGHT = 40;
export const MAX_WARNINGS = 40;

/** What differs between teams: passed in by the caller, never hard-coded in the runtime. */
export interface RenderCfg {
	/** Shared-plugin-data namespace the boards and layers are tagged with. */
	ns: string;
	/** Page names (compared after normalization) the renderer refuses to write to. */
	guards: readonly string[];
	/** Page used when the caller names none. */
	defaultPage: string;
	/**
	 * Wall-clock budget for one screen. Must stay below the client's render timeout so Penpot
	 * always gives up before the client does.
	 */
	budgetMs: number;
}

export interface RenderOpts {
	page: string;
	/** Explicit position for a board that does not exist yet. */
	x?: number;
	y?: number;
}

export interface RenderSummary {
	screenId: string;
	boardId: string;
	nodes: number;
	ms: number;
	warnings: string[];
}

/** Lane origin per platform (R3.3): boards of one platform extend rightwards in their lane. */
export const LANE_Y: Record<Platform, number> = { web: 0, ios: 1300, android: 2500 };
export const LANE_GAP = 80;

export interface PlacedBoard {
	x: number;
	width: number;
	platform?: string;
}

/** Position for a new board: right of the right-most board in its platform lane. */
export function placeBoard(
	existing: readonly PlacedBoard[],
	platform: Platform,
): { x: number; y: number } {
	const lane = existing.filter((b) => b.platform === platform);
	const right = lane.reduce((m, b) => Math.max(m, b.x + b.width), Number.NEGATIVE_INFINITY);
	return { x: lane.length === 0 ? 0 : right + LANE_GAP, y: LANE_Y[platform] };
}

/** Width available to children of a board, after horizontal padding. */
export function innerWidth(width: number, layout: RLayout): number {
	const p = layout.padding;
	return Math.max(0, width - (p ? p[1].px + p[3].px : 0));
}

export type Sizing = "fix" | "fill" | "auto";

/** Effective child sizing: authored value, else a block-like default (fill across a column, hug in a row). */
export function effectiveSizing(
	kind: "frame" | "text" | "component",
	lc: LayoutChild | undefined,
	parentDir: RLayout["dir"],
): { h: Sizing; v: Sizing } {
	const inLayout = parentDir !== "none";
	const defaultH: Sizing = kind === "component" ? "fix" : parentDir === "column" ? "fill" : "auto";
	const defaultV: Sizing = kind === "component" ? "fix" : "auto";
	let h = lc?.h ?? defaultH;
	let v = lc?.v ?? defaultV;
	// "fill" only exists inside a flex parent.
	if (!inLayout) {
		if (h === "fill") h = "fix";
		if (v === "fill") v = "fix";
	}
	return { h, v };
}

export const ALIGN_MAP = { start: "start", center: "center", end: "end", stretch: "stretch" } as const;
export const JUSTIFY_MAP = {
	start: "start",
	center: "center",
	end: "end",
	between: "space-between",
} as const;

/** An empty `characters` string is invalid in Penpot (pitfall list): hide the layer instead. */
export function isEmptyText(text: string): boolean {
	return text.length === 0;
}

/** Counts nodes in a subtree (frames, texts and components). */
export function countNodes(nodes: readonly RNode[]): number {
	let n = 0;
	for (const node of nodes) n += 1 + (node.kind === "frame" ? countNodes(node.children) : 0);
	return n;
}

/** Keeps the returned payload small: dedupe, then cap. */
export function capWarnings(warnings: readonly string[]): string[] {
	const unique = [...new Set(warnings)];
	if (unique.length <= MAX_WARNINGS) return unique;
	return [...unique.slice(0, MAX_WARNINGS), `... ${unique.length - MAX_WARNINGS} more`];
}
