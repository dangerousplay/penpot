// GENERATED from nova-terra tools/design-bridge/src/engine/pull/to-ir.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Server side of pull (design R8.1): raw facts from the plugin reader -> IR. Pure and offline:
// the token-name tables are the inverse of the theme, and the messages come from the caller.
// Pull never fails on a hand-built board: what cannot be classified becomes a placeholder frame
// with `unsupported`, and everything lossy is reported as a warning.

import { resolveText } from "../i18n";
import type { CompiledMessages } from "../i18n";
import type { Dim, Layout, LayoutChild, Node, Platform, ScreenNode, StyleRefs, TextValue } from "../ir/schema";
import { safeName } from "../push/render-model";
import type { RLayout } from "../push/render-model";
import type { Theme } from "../theme";
import type { RawBoard, RawChild, RawFlex, RawNode, RawText } from "./raw";

/** Height a frame keeps when the author gave none (the reader treats it as "unset"). */
const PRESET_HEIGHT = 40;

type Sizing = "fix" | "fill" | "auto";

/** Effective child sizing: a block-like default (fill across a column, hug in a row). */
function effectiveSizing(kind: "frame" | "text" | "component", parentDir: RLayout["dir"]): { h: Sizing; v: Sizing } {
	const inLayout = parentDir !== "none";
	let h: Sizing = kind === "component" ? "fix" : parentDir === "column" ? "fill" : "auto";
	let v = (kind === "component" ? "fix" : "auto") as Sizing;
	// "fill" only exists inside a flex parent.
	if (!inLayout) {
		if (h === "fill") h = "fix";
		if (v === "fill") v = "fix";
	}
	return { h, v };
}

export interface Drift {
	screenId: string;
	key: string;
	penpot: string;
	bundle: string;
}

export interface DroppedSlot {
	/** `node` tag, or the positional path `screenId/0/2` when the shape is untagged. */
	nodeId: string;
	layer: string;
	/** The main component's text for the layer; only an equal authored literal may be dropped. */
	text: string;
}

export interface ToIrOptions {
	theme: Theme;
	/** COPY-DRIFT is computed only when messages are given. */
	messages?: CompiledMessages;
	locale: string;
}

export interface ToIrResult {
	screen: ScreenNode;
	warnings: string[];
	drift: Drift[];
	/** Literal slots whose text equals the main component's: the reader cannot see them. */
	dropped: DroppedSlot[];
}

export function formatDrift(d: Drift): string {
	return `COPY-DRIFT ${d.screenId} ${d.key} "${d.penpot}" ≠ "${d.bundle}"`;
}

// --- token name -> class key tables (inverse of the theme) ---

type Table = Map<string, string>;

interface Tables {
	color: Table;
	radius: Table;
	shadow: Table;
	spacing: Table;
}

function invert(entries: Iterable<[string, { token: string }]>): Table {
	const out: Table = new Map();
	for (const [key, v] of entries) if (!out.has(v.token)) out.set(v.token, key);
	return out;
}

const tablesCache = new WeakMap<Theme, Tables>();

function tablesOf(theme: Theme): Tables {
	let t = tablesCache.get(theme);
	if (!t) {
		t = {
			color: invert(Object.entries(theme.colors)),
			radius: invert(Object.entries(theme.radius)),
			shadow: invert(Object.entries(theme.shadow)),
			spacing: invert(Object.entries(theme.spacing)),
		};
		tablesCache.set(theme, t);
	}
	return t;
}

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `shape.tokens` property names vary in case and separators across Penpot versions. */
function tokenFor(tokens: Record<string, string> | undefined, ...props: string[]): string | undefined {
	if (!tokens) return undefined;
	const wanted = new Set(props.map(squash));
	for (const [k, v] of Object.entries(tokens)) if (wanted.has(squash(k))) return v;
	return undefined;
}

function tokenWithPrefix(tokens: Record<string, string> | undefined, prefix: string): string | undefined {
	if (!tokens) return undefined;
	for (const [k, v] of Object.entries(tokens)) if (squash(k).startsWith(prefix)) return v;
	return undefined;
}

interface Ctx {
	screenId: string;
	locale: string;
	theme: Theme;
	tables: Tables;
	messages?: CompiledMessages;
	warnings: string[];
	drift: Drift[];
	dropped: DroppedSlot[];
}

function lookupKey(table: Table, name: string | undefined, where: string, what: string, ctx: Ctx): string | undefined {
	if (name === undefined) return undefined;
	const key = table.get(name);
	if (key === undefined) ctx.warnings.push(`${where}: ${what} token "${name}" is not a code token; ignored`);
	return key;
}

function styleOf(tokens: Record<string, string> | undefined, where: string, ctx: Ctx): StyleRefs {
	const out: StyleRefs = {};
	const fill = lookupKey(ctx.tables.color, tokenFor(tokens, "fill"), where, "fill", ctx);
	if (fill !== undefined) out.fill = fill;
	const stroke = lookupKey(ctx.tables.color, tokenFor(tokens, "strokeColor", "stroke"), where, "stroke", ctx);
	if (stroke !== undefined) out.stroke = stroke;
	const rad = lookupKey(
		ctx.tables.radius,
		tokenFor(tokens, "radius", "borderRadius") ?? tokenWithPrefix(tokens, "borderradius"),
		where,
		"radius",
		ctx,
	);
	if (rad !== undefined) out.radius = rad;
	const sh = lookupKey(ctx.tables.shadow, tokenFor(tokens, "shadow"), where, "shadow", ctx);
	if (sh !== undefined) out.shadow = sh;
	return out;
}

function dimOf(tokenNameValue: string | undefined, px: number | undefined, ctx: Ctx): Dim | undefined {
	if (tokenNameValue !== undefined) {
		const key = ctx.tables.spacing.get(tokenNameValue);
		if (key !== undefined) return { token: key };
	}
	return px === undefined ? undefined : { px };
}

const ALIGN = new Set(["center", "end", "stretch"]);

function layoutOf(flex: RawFlex | undefined, tokens: Record<string, string> | undefined, where: string, ctx: Ctx): Layout {
	if (!flex) return { dir: "none" };
	let dir: "column" | "row";
	if (flex.dir === "column" || flex.dir === "row") dir = flex.dir;
	else {
		dir = flex.dir.startsWith("column") ? "column" : "row";
		ctx.warnings.push(`${where}: flex direction "${flex.dir}" is not supported; read as ${dir}`);
	}
	const layout: Layout = { dir };
	const gapPx = dir === "row" ? flex.columnGap : flex.rowGap;
	const gap = dimOf(tokenFor(tokens, "rowGap", "columnGap", "gap"), gapPx && gapPx > 0 ? gapPx : undefined, ctx);
	if (gap) layout.gap = gap;
	const sides: [string, number][] = [
		["paddingTop", flex.pad?.[0] ?? 0],
		["paddingRight", flex.pad?.[1] ?? 0],
		["paddingBottom", flex.pad?.[2] ?? 0],
		["paddingLeft", flex.pad?.[3] ?? 0],
	];
	const pad = sides.map(([prop, px]) => dimOf(tokenFor(tokens, prop), px, ctx) ?? { px: 0 });
	if (sides.some(([prop, px]) => px !== 0 || tokenFor(tokens, prop) !== undefined)) {
		layout.padding = pad as [Dim, Dim, Dim, Dim];
	}
	if (flex.align !== undefined && ALIGN.has(flex.align)) layout.align = flex.align as NonNullable<Layout["align"]>;
	else if (flex.align !== undefined && flex.align !== "start") {
		ctx.warnings.push(`${where}: align-items "${flex.align}" is not supported; ignored`);
	}
	if (flex.justify === "center" || flex.justify === "end") layout.justify = flex.justify;
	else if (flex.justify === "space-between") layout.justify = "between";
	else if (flex.justify !== undefined && flex.justify !== "start") {
		ctx.warnings.push(`${where}: justify-content "${flex.justify}" is not supported; ignored`);
	}
	if (flex.wrap) layout.wrap = true;
	return layout;
}

function innerWidth(width: number, layout: Layout, theme: Theme): number {
	const p = layout.padding;
	const px = (d: Dim): number => ("px" in d ? d.px : Object.hasOwn(theme.spacing, d.token) ? theme.spacing[d.token]!.value : 0);
	return Math.max(0, width - (p ? px(p[1]) + px(p[3]) : 0));
}

/** A live read may carry `key: null`; null and "" both mean "no i18n tag". */
function keyOf(rt: RawText): string | undefined {
	const k = rt.key as string | null | undefined;
	return typeof k === "string" && k !== "" ? k : undefined;
}

function textValue(rt: RawText, where: string, ctx: Ctx, track: boolean): TextValue {
	const key = keyOf(rt);
	if (key !== undefined) {
		if (track && rt.hidden !== true && ctx.messages !== undefined) {
			try {
				const resolved = resolveText(rt.params === undefined ? { key } : { key, params: rt.params }, {
					messages: ctx.messages,
					locale: ctx.locale,
					strict: true,
				});
				if (resolved.text !== rt.text) {
					ctx.drift.push({ screenId: ctx.screenId, key, penpot: rt.text, bundle: resolved.text });
				}
			} catch (e) {
				ctx.warnings.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		return rt.params === undefined ? { key } : { key, params: rt.params };
	}
	return { literal: rt.hidden === true ? "" : rt.text };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;

interface SizeInput {
	kind: "frame" | "text" | "component";
	raw: { w: number; h: number; child?: RawChild };
	flex?: RawFlex;
	grow?: string;
	main?: { w: number; h: number };
}

function layoutChildOf(i: SizeInput, parentDir: Layout["dir"], avail: number): LayoutChild | undefined {
	const def = effectiveSizing(i.kind, parentDir);
	const lc: LayoutChild = {};
	let h: "fix" | "fill" | "auto";
	let v: "fix" | "fill" | "auto";
	if (i.raw.child?.h === "fill") h = "fill";
	else if (i.kind === "text") h = i.grow === "auto-width" ? "auto" : "fix";
	else if (i.kind === "component") h = "fix";
	else if (i.flex) h = i.flex.hs === "auto" ? "auto" : "fix";
	else h = near(i.raw.w, avail) ? (def.h === "fill" ? "fix" : def.h) : "fix";
	if (i.raw.child?.v === "fill") v = "fill";
	else if (i.kind === "text") v = i.grow === "fixed" ? "fix" : "auto";
	else if (i.kind === "component") v = "fix";
	else if (i.flex) v = i.flex.vs === "auto" ? "auto" : "fix";
	else v = near(i.raw.h, PRESET_HEIGHT) ? def.v : "fix";

	// A component copy gets a fixed size only when that axis is really `fix` in Penpot and the
	// size differs from the main by more than 1 px. auto/fill axes are laid out by Penpot, so
	// their measured size (e.g. h:173 vs mainH:172) is not authored.
	const axisFix = (axis: "h" | "v"): boolean => i.raw.child?.[axis] !== "auto" && i.raw.child?.[axis] !== "fill";
	const differs = (a: number, b: number): boolean => Math.abs(a - b) > 1;
	const widthWhenFix =
		h === "fix" &&
		(i.kind === "component"
			? i.main !== undefined && axisFix("h") && differs(i.raw.w, i.main.w)
			: h !== def.h || (i.main !== undefined && !near(i.raw.w, i.main.w)));
	const heightWhenFix =
		v === "fix" &&
		(i.kind === "component"
			? i.main !== undefined && axisFix("v") && differs(i.raw.h, i.main.h)
			: v !== def.v || (i.main !== undefined && !near(i.raw.h, i.main.h)));
	if (h !== def.h || widthWhenFix) lc.h = h;
	if (v !== def.v || heightWhenFix) lc.v = v;
	if (widthWhenFix) lc.width = i.raw.w;
	if (heightWhenFix) lc.height = i.raw.h;
	return Object.keys(lc).length > 0 ? lc : undefined;
}

function convertNode(raw: RawNode, path: string, parentDir: Layout["dir"], avail: number, ctx: Ctx): Node {
	const nodeId = raw.node ?? path;
	const id = raw.node;
	switch (raw.t) {
		case "board": {
			const layout = layoutOf(raw.flex, raw.tokens, nodeId, ctx);
			const inner = innerWidth(raw.w, layout, ctx.theme);
			const node: Extract<Node, { kind: "frame" }> = {
				kind: "frame",
				layout,
				style: styleOf(raw.tokens, nodeId, ctx),
				children: raw.children.map((c, i) => convertNode(c, `${path}/${i}`, layout.dir, inner, ctx)),
			};
			if (id !== undefined) node.id = id;
			if (raw.name !== "Frame") node.name = safeName(raw.name);
			const lc = layoutChildOf(
				raw.flex ? { kind: "frame", raw, flex: raw.flex } : { kind: "frame", raw },
				parentDir,
				avail,
			);
			if (lc) node.layoutChild = lc;
			return node;
		}
		case "text": {
			const node: Extract<Node, { kind: "text" }> = {
				kind: "text",
				value: textValue(raw.text, nodeId, ctx, true),
				style: styleOf(raw.tokens, nodeId, ctx),
			};
			if (keyOf(raw.text) === undefined && raw.text.hidden !== true) {
				ctx.warnings.push(`${nodeId}: text "${raw.text.text.slice(0, 40)}" has no i18n tag; emitted as a literal`);
			}
			if (id !== undefined) node.id = id;
			const lc = layoutChildOf(
				raw.grow === undefined ? { kind: "text", raw } : { kind: "text", raw, grow: raw.grow },
				parentDir,
				avail,
			);
			if (lc) node.layoutChild = lc;
			return node;
		}
		case "copy": {
			const slots: Record<string, TextValue> = {};
			for (const [layer, rt] of Object.entries(raw.slots)) {
				slots[layer] = textValue(rt, `${nodeId}.${layer}`, ctx, true);
			}
			if (Array.isArray(raw.same)) throw new Error("design-bridge: read file uses the old `same` list format; re-run the read (same is now a {layer: mainText} map)");
			for (const [layer, text] of Object.entries(raw.same ?? {})) ctx.dropped.push({ nodeId, layer, text });
			const node: Extract<Node, { kind: "component" }> = {
				kind: "component",
				set: raw.set,
				variant: { ...raw.props },
				slots,
			};
			if (id !== undefined) node.id = id;
			const lc = layoutChildOf({ kind: "component", raw, main: { w: raw.mainW, h: raw.mainH } }, parentDir, avail);
			if (lc) node.layoutChild = lc;
			return node;
		}
		case "other": {
			ctx.warnings.push(`${nodeId}: unsupported shape type "${raw.type}" (${raw.name}); placeholder frame`);
			const node: Extract<Node, { kind: "frame" }> = {
				kind: "frame",
				name: safeName(raw.name),
				layout: { dir: "none" },
				style: {},
				children: [],
				unsupported: raw.type,
			};
			if (id !== undefined) node.id = id;
			return node;
		}
	}
}

const PLATFORM_PREFIX = /^(Web|iOS|Android) · /;
const PLATFORM_BY_LABEL: Record<string, Platform> = { Web: "web", iOS: "ios", Android: "android" };

export function slugify(name: string): string {
	const s = name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return s === "" ? "screen" : s;
}

function platformOf(raw: RawBoard, ctx: Ctx): Platform {
	if (raw.platform === "web" || raw.platform === "ios" || raw.platform === "android") return raw.platform;
	const label = PLATFORM_PREFIX.exec(raw.name)?.[1];
	if (label !== undefined) return PLATFORM_BY_LABEL[label] as Platform;
	const guess: Platform = raw.w >= 800 ? "web" : "ios";
	ctx.warnings.push(`${raw.name}: no platform tag or name prefix; guessed "${guess}" from width ${raw.w}`);
	return guess;
}

export function toIr(raw: RawBoard, opts: ToIrOptions): ToIrResult {
	const screenId = raw.screenId ?? slugify(raw.name);
	const ctx: Ctx = {
		screenId,
		locale: opts.locale,
		theme: opts.theme,
		tables: tablesOf(opts.theme),
		warnings: [],
		drift: [],
		dropped: [],
	};
	if (opts.messages) ctx.messages = opts.messages;
	const platform = platformOf(raw, ctx);
	const layout = layoutOf(raw.flex, raw.tokens, screenId, ctx);
	if (raw.flex && layout.dir !== "column") {
		ctx.warnings.push(`${screenId}: a Screen is always a column; the ${layout.dir} direction is ignored`);
	}
	layout.dir = "column";
	const title = safeName(raw.name.replace(PLATFORM_PREFIX, "")).trim() || "Screen";
	const inner = innerWidth(raw.w, layout, ctx.theme);
	const screen: ScreenNode = {
		kind: "screen",
		id: screenId,
		platform,
		title,
		layout,
		children: raw.children.map((c, i) => convertNode(c, `${screenId}/${i}`, "column", inner, ctx)),
	};
	return { screen, warnings: ctx.warnings, drift: ctx.drift, dropped: ctx.dropped };
}

/**
 * Removes, from an authored screen, the literal slots the reader cannot see: only those whose
 * literal equals the main component's text. A different literal that Penpot shows as the
 * main's text (a masked edit) stays and surfaces as a diff. Positional ids follow prepare.ts: `screenId/0/1`.
 */
export function reconcileDropped(screen: ScreenNode, dropped: readonly DroppedSlot[]): ScreenNode {
	const by = new Map<string, Map<string, string>>();
	for (const d of dropped) {
		const set = by.get(d.nodeId) ?? new Map<string, string>();
		set.set(d.layer, d.text);
		by.set(d.nodeId, set);
	}
	const visit = (node: Node, path: string): Node => {
		if (node.kind === "frame") {
			return { ...node, children: node.children.map((c, i) => visit(c, `${path}/${i}`)) };
		}
		if (node.kind !== "component") return node;
		const layers = by.get(node.id ?? path);
		if (!layers) return node;
		const slots = Object.fromEntries(
			Object.entries(node.slots).filter(([layer, v]) => !(layers.has(layer) && "literal" in v && v.literal === layers.get(layer))),
		);
		return { ...node, slots };
	};
	return { ...screen, children: screen.children.map((c, i) => visit(c, `${screen.id}/${i}`)) };
}
