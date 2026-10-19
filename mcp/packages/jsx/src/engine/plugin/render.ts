// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/render.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot (bundled into the plugin IIFE). Builds one screen board from a
// pre-resolved render model (see render-core.ts). Stateless: no `storage`, no globals;
// `penpot` and the team-specific values (`RenderCfg`) are arguments. Idempotent: the board is
// upserted by sharedPluginData (`<ns>`,"screenId"); a re-push builds the new board, then
// replaces the old one at the same x/y (context D9).

import { JsxError } from "../errors";
import {
	ALIGN_MAP,
	JUSTIFY_MAP,
	PRESET_HEIGHT,
	capWarnings,
	countNodes,
	effectiveSizing,
	innerWidth,
	isEmptyText,
	isForbiddenPage,
	placeBoard,
	safeName,
} from "./render-core";
import type { RDim, RLayout, RNode, RStyle, RText, RToken, RScreen, RenderCfg, RenderOpts, RenderSummary } from "./render-core";
import type { LayoutChild } from "../ir/schema";

type Props = string[];

interface LiveToken {
	name: string;
}
interface LiveFlex {
	dir: string;
	wrap: string;
	alignItems: string;
	justifyContent: string;
	rowGap: number;
	columnGap: number;
	topPadding: number;
	rightPadding: number;
	bottomPadding: number;
	leftPadding: number;
	horizontalSizing: string;
	verticalSizing: string;
}
interface LiveChildProps {
	horizontalSizing: string;
	verticalSizing: string;
}
interface LiveShape {
	readonly id: string;
	readonly type: string;
	readonly width: number;
	readonly height: number;
	readonly children?: LiveShape[];
	readonly flex?: LiveFlex;
	readonly layoutChild?: LiveChildProps;
	name: string;
	x: number;
	y: number;
	hidden: boolean;
	fills: unknown[];
	strokes: unknown[];
	borderRadius: number;
	characters: string;
	growType: string;
	resize(width: number, height: number): void;
	appendChild(child: LiveShape): void;
	remove(): void;
	addFlexLayout(): LiveFlex;
	applyToken(token: LiveToken, properties?: Props): void;
	setSharedPluginData(ns: string, key: string, value: string): void;
	getSharedPluginData(ns: string, key: string): string;
	isComponentInstance(): boolean;
}
interface LiveComponent {
	readonly id: string;
	instance(): LiveShape;
	readonly variants?: { variantComponents(): LiveComponent[] } | null;
}
interface LiveLibrary {
	readonly id?: string;
	readonly components: LiveComponent[];
}
interface LivePage {
	readonly name: string;
	readonly root: LiveShape;
}
export interface LivePenpot {
	selection: LiveShape[];
	readonly currentFile: { pages: LivePage[] } | null;
	readonly currentPage: LivePage | null;
	createPage(): LivePage & { name: string };
	openPage(page: LivePage): Promise<void>;
	createBoard(): LiveShape;
	createText(text: string): LiveShape | null;
	readonly library: {
		local: LiveLibrary & { tokens: { sets: { tokens: LiveToken[] }[] } };
		/** Connected shared libraries (Penpot >= 2.18); absent on older builds. */
		connected?: LiveLibrary[];
	};
}

interface Ctx {
	P: LivePenpot;
	cfg: RenderCfg;
	screenId: string;
	t0: number;
	warnings: string[];
	count: number;
	/** Variant id -> component, per library id (`""` when a library exposes no id). */
	components?: Map<string, Map<string, LiveComponent>>;
	tokens?: Map<string, LiveToken>;
}

function msg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function warn(ctx: Ctx, text: string): void {
	ctx.warnings.push(text);
}

function checkBudget(ctx: Ctx): void {
	if (Date.now() - ctx.t0 > ctx.cfg.budgetMs) {
		throw new JsxError("BUDGET_EXCEEDED", `render budget of ${ctx.cfg.budgetMs} ms exceeded; split the screen`);
	}
}

function indexLibrary(lib: LiveLibrary): Map<string, LiveComponent> {
	const map = new Map<string, LiveComponent>();
	for (const c of lib.components) {
		map.set(c.id, c);
		if (c.variants) for (const v of c.variants.variantComponents()) map.set(v.id, v);
	}
	return map;
}

/**
 * `library.components` lists one entry per variant group: index every variant by its own id.
 * With a `libraryId` the lookup is scoped to that library (local or connected); without one, or
 * when the id matches no library, every library is searched, local first.
 */
function findComponent(ctx: Ctx, id: string, libraryId?: string): LiveComponent | undefined {
	if (!ctx.components) {
		const libs = [ctx.P.library.local, ...(ctx.P.library.connected ?? [])];
		ctx.components = new Map();
		for (const lib of libs) {
			const key = lib.id ?? "";
			const map = indexLibrary(lib);
			const prev = ctx.components.get(key);
			if (prev) for (const [k, v] of map) prev.set(k, v);
			else ctx.components.set(key, map);
		}
	}
	if (libraryId !== undefined) {
		const hit = ctx.components.get(libraryId)?.get(id);
		if (hit) return hit;
	}
	for (const map of ctx.components.values()) {
		const hit = map.get(id);
		if (hit) {
			if (libraryId !== undefined) warn(ctx, `component ${id} not found in library ${libraryId}; used another library's copy`);
			return hit;
		}
	}
	return undefined;
}

function findToken(ctx: Ctx, name: string): LiveToken | undefined {
	if (!ctx.tokens) {
		const map = new Map<string, LiveToken>();
		for (const s of ctx.P.library.local.tokens.sets) {
			for (const t of s.tokens) if (!map.has(t.name)) map.set(t.name, t);
		}
		ctx.tokens = map;
	}
	return ctx.tokens.get(name);
}

/** R3.8: a missing or unappliable token warns; the caller has already set the raw value. */
function bind(ctx: Ctx, shape: LiveShape, tokenName: string, props: Props): void {
	const token = findToken(ctx, tokenName);
	if (!token) {
		warn(ctx, `token "${tokenName}" not found; raw value used`);
		return;
	}
	try {
		shape.applyToken(token, props);
	} catch (e) {
		warn(ctx, `token "${tokenName}" could not be applied: ${msg(e)}`);
	}
}

function tag(ctx: Ctx, shape: LiveShape, nodeId: string): void {
	shape.setSharedPluginData(ctx.cfg.ns, "node", nodeId);
}

function tagText(ctx: Ctx, shape: LiveShape, rt: RText): void {
	if (rt.key === undefined) return;
	shape.setSharedPluginData(ctx.cfg.ns, "i18n", rt.key);
	shape.setSharedPluginData(ctx.cfg.ns, "i18nParams", JSON.stringify(rt.params ?? {}));
}

function setDim(
	ctx: Ctx,
	shape: LiveShape,
	dim: RDim,
	set: () => void,
	props: Props,
): void {
	set();
	if (dim.token !== undefined) bind(ctx, shape, dim.token, props);
}

function applyLayout(ctx: Ctx, board: LiveShape, layout: RLayout): LiveFlex | undefined {
	if (layout.dir === "none") return undefined;
	const flex = board.addFlexLayout();
	flex.dir = layout.dir;
	flex.wrap = layout.wrap ? "wrap" : "nowrap";
	if (layout.align) flex.alignItems = ALIGN_MAP[layout.align];
	if (layout.justify) flex.justifyContent = JUSTIFY_MAP[layout.justify];
	if (layout.gap) {
		const gap = layout.gap;
		setDim(ctx, board, gap, () => {
			flex.rowGap = gap.px;
			flex.columnGap = gap.px;
		}, ["rowGap", "columnGap"]);
	}
	if (layout.padding) {
		const [t, r, b, l] = layout.padding;
		setDim(ctx, board, t, () => (flex.topPadding = t.px), ["paddingTop"]);
		setDim(ctx, board, r, () => (flex.rightPadding = r.px), ["paddingRight"]);
		setDim(ctx, board, b, () => (flex.bottomPadding = b.px), ["paddingBottom"]);
		setDim(ctx, board, l, () => (flex.leftPadding = l.px), ["paddingLeft"]);
	}
	return flex;
}

function solidFill(tok: RToken): unknown[] {
	return typeof tok.raw === "string" ? [{ fillColor: tok.raw, fillOpacity: 1 }] : [];
}

function applyStyle(ctx: Ctx, shape: LiveShape, style: RStyle, isText: boolean): void {
	if (style.fill) {
		shape.fills = solidFill(style.fill);
		bind(ctx, shape, style.fill.name, ["fill"]);
	} else if (!isText) {
		shape.fills = []; // a frame is transparent unless it asks for a fill
	}
	if (style.stroke) {
		if (typeof style.stroke.raw === "string") {
			shape.strokes = [
				{ strokeColor: style.stroke.raw, strokeOpacity: 1, strokeWidth: 1, strokeStyle: "solid", strokeAlignment: "inner" },
			];
		}
		bind(ctx, shape, style.stroke.name, ["strokeColor"]);
	}
	if (style.radius) {
		if (typeof style.radius.raw === "number") shape.borderRadius = style.radius.raw;
		bind(ctx, shape, style.radius.name, [
			"borderRadiusTopLeft",
			"borderRadiusTopRight",
			"borderRadiusBottomRight",
			"borderRadiusBottomLeft",
		]);
	}
	if (style.shadow) bind(ctx, shape, style.shadow.name, ["shadow"]);
}

/** Sets characters, re-lays out (growType re-assign) and reads back (R3.7). */
function setCharacters(ctx: Ctx, shape: LiveShape, rt: RText, label: string): void {
	if (isEmptyText(rt.text)) {
		shape.hidden = true; // an empty string is invalid; hide the layer instead
		tagText(ctx, shape, rt);
		return;
	}
	shape.hidden = false;
	shape.characters = rt.text;
	const grow = shape.growType;
	shape.growType = "fixed";
	shape.growType = grow;
	if (shape.characters !== rt.text) warn(ctx, `${label}: text read back differs from "${rt.text}"`);
	tagText(ctx, shape, rt);
}

function findTextLayer(shape: LiveShape, name: string): LiveShape | undefined {
	for (const c of shape.children ?? []) {
		if (c.type === "text" && c.name === name) return c;
		const deep = findTextLayer(c, name);
		if (deep) return deep;
	}
	return undefined;
}

/** Child sizing inside the parent. Only valid after `parent.appendChild(shape)` (fill needs a flex parent). */
function applySizing(
	shape: LiveShape,
	kind: "frame" | "text" | "component",
	lc: LayoutChild | undefined,
	parentDir: RLayout["dir"],
	availWidth: number,
): void {
	const { h, v } = effectiveSizing(kind, lc, parentDir);
	const lcp = shape.layoutChild;
	const flex = shape.flex;
	if (kind === "text") {
		if (h === "fill" && lcp) lcp.horizontalSizing = "fill";
		if (h === "fix") shape.resize(lc?.width ?? Math.min(availWidth, shape.width), shape.height);
		shape.growType = h === "auto" ? "auto-width" : "auto-height";
		if (v === "fix" && lc?.height !== undefined) shape.resize(shape.width, lc.height);
		return;
	}
	if (h === "fill" && lcp) lcp.horizontalSizing = "fill";
	else if (h === "auto" && flex) flex.horizontalSizing = "auto";
	else if (h === "fix" && lc?.width !== undefined) shape.resize(lc.width, shape.height);
	if (v === "fill" && lcp) lcp.verticalSizing = "fill";
	else if (v === "auto" && flex) flex.verticalSizing = "auto";
	else if (v === "fix" && lc?.height !== undefined) shape.resize(shape.width, lc.height);
}

function buildFrame(
	ctx: Ctx,
	node: Extract<RNode, { kind: "frame" }>,
	parent: LiveShape,
	parentDir: RLayout["dir"],
	availWidth: number,
): void {
	const sizing = effectiveSizing("frame", node.layoutChild, parentDir);
	// Final width first: an undersized board renders its fill-width children mirrored.
	const width = sizing.h === "fix" && node.layoutChild?.width !== undefined ? node.layoutChild.width : availWidth;
	const b = ctx.P.createBoard();
	b.name = safeName(node.name ?? "Frame");
	b.resize(width, node.layoutChild?.height ?? PRESET_HEIGHT);
	applyStyle(ctx, b, node.style, false);
	applyLayout(ctx, b, node.layout);
	if (node.layoutChild?.height === undefined && (node.layout.dir === "none" ? sizing.v !== "fill" : sizing.v === "fix")) {
		warn(ctx, `${node.nodeId}: frame keeps the ${PRESET_HEIGHT} px preset height; set a height or use a flex direction with hug sizing`);
	}
	const inner = innerWidth(width, node.layout);
	for (const child of node.children) buildNode(ctx, child, b, node.layout.dir, inner);
	parent.appendChild(b);
	applySizing(b, "frame", node.layoutChild, parentDir, availWidth);
	tag(ctx, b, node.nodeId);
}

function buildText(
	ctx: Ctx,
	node: Extract<RNode, { kind: "text" }>,
	parent: LiveShape,
	parentDir: RLayout["dir"],
	availWidth: number,
): void {
	const empty = isEmptyText(node.text.text);
	const t = ctx.P.createText(empty ? "." : node.text.text);
	if (!t) throw new Error(`${node.nodeId}: createText returned null`);
	t.name = safeName(node.text.key ?? (node.text.text.slice(0, 40) || "Text"));
	applyStyle(ctx, t, node.style, true);
	const { h } = effectiveSizing("text", node.layoutChild, parentDir);
	if (h === "fill") t.resize(availWidth, t.height);
	parent.appendChild(t);
	applySizing(t, "text", node.layoutChild, parentDir, availWidth);
	setCharacters(ctx, t, node.text, node.nodeId);
	tag(ctx, t, node.nodeId);
}

function buildComponent(
	ctx: Ctx,
	node: Extract<RNode, { kind: "component" }>,
	parent: LiveShape,
	parentDir: RLayout["dir"],
	availWidth: number,
): void {
	const comp = findComponent(ctx, node.componentId, node.libraryId);
	if (!comp) {
		throw new Error(`${node.nodeId}: component "${node.set}" (${node.componentId}) not found in the library`);
	}
	const inst = comp.instance();
	// instance() selects the new copy; a lingering selection makes later appends fail with
	// "Cannot change the structure of a component copy".
	ctx.P.selection = [];
	parent.appendChild(inst);
	if (!inst.isComponentInstance()) warn(ctx, `${node.nodeId}: "${node.set}" is not a component copy`);
	for (const [layer, rt] of Object.entries(node.slots)) {
		const t = findTextLayer(inst, layer);
		if (!t) {
			warn(ctx, `${node.nodeId}: "${node.set}" has no text layer "${layer}"`);
			continue;
		}
		setCharacters(ctx, t, rt, `${node.nodeId}.${layer}`);
	}
	applySizing(inst, "component", node.layoutChild, parentDir, availWidth);
	tag(ctx, inst, node.nodeId);
}

function buildNode(ctx: Ctx, node: RNode, parent: LiveShape, parentDir: RLayout["dir"], availWidth: number): void {
	checkBudget(ctx);
	ctx.count += 1;
	if (node.kind === "frame") buildFrame(ctx, node, parent, parentDir, availWidth);
	else if (node.kind === "text") buildText(ctx, node, parent, parentDir, availWidth);
	else buildComponent(ctx, node, parent, parentDir, availWidth);
}

async function ensurePage(P: LivePenpot, name: string): Promise<LivePage> {
	const pages = P.currentFile?.pages ?? [];
	let page: LivePage | undefined = pages.find((p) => p.name === name);
	if (!page) {
		const created = P.createPage();
		created.name = name;
		page = created;
	}
	await P.openPage(page);
	return page;
}

export async function render(
	P: LivePenpot,
	screen: RScreen,
	opts: RenderOpts,
	cfg: RenderCfg,
): Promise<RenderSummary> {
	const t0 = Date.now();
	const pageName = opts.page || cfg.defaultPage;
	if (isForbiddenPage(pageName, cfg.guards)) {
		throw new JsxError("PAGE_FORBIDDEN", `refusing to write to the guarded page "${pageName}"`, {
			hint: "choose another page",
		});
	}
	const ctx: Ctx = { P, cfg, screenId: screen.id, t0, warnings: [], count: 0 };
	const page = await ensurePage(P, pageName);
	const root = page.root;

	const boards = (root.children ?? []).filter((c) => c.type === "board");
	const old = boards.filter((b) => b.getSharedPluginData(cfg.ns, "screenId") === screen.id);
	const at =
		old[0] !== undefined
			? { x: old[0].x, y: old[0].y }
			: opts.x !== undefined && opts.y !== undefined
				? { x: opts.x, y: opts.y }
				: placeBoard(
						boards.map((b) => ({
							x: b.x,
							width: b.width,
							platform: b.getSharedPluginData(cfg.ns, "platform"),
						})),
						screen.platform,
					);

	// Build the new board first, then swap: a failed push leaves the previous board intact.
	const board = P.createBoard();
	board.name = safeName(screen.name);
	board.resize(screen.width, screen.height);
	root.appendChild(board);
	board.x = at.x;
	board.y = at.y;
	try {
		const flex = applyLayout(ctx, board, screen.layout);
		const inner = innerWidth(screen.width, screen.layout);
		for (const child of screen.children) buildNode(ctx, child, board, screen.layout.dir, inner);
		if (flex) flex.verticalSizing = "fix"; // the preset height wins over content
		tag(ctx, board, screen.id);
		board.setSharedPluginData(cfg.ns, "screenId", screen.id);
		board.setSharedPluginData(cfg.ns, "platform", screen.platform);
		board.x = at.x;
		board.y = at.y;
		// The swap is the last action: nothing after it can fail and strand a half state.
		for (const o of old) o.remove();
	} catch (e) {
		try {
			board.remove();
			P.selection = [];
		} catch {
			// cleanup is best effort; the original error is what matters
		}
		throw e;
	}
	P.selection = [];
	return {
		screenId: screen.id,
		boardId: board.id,
		nodes: 1 + countNodes(screen.children),
		ms: Date.now() - t0,
		warnings: capWarnings(ctx.warnings),
	};
}
