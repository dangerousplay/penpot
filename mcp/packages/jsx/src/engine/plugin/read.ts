// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/read.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot (bundled into the plugin IIFE). READ-ONLY: it never mutates a shape,
// never opens a page and never touches storage, so it is safe on any guarded page.
// Walks one screen board and returns raw facts (read-core.ts RawBoard); the server turns them
// into IR. Tags written by render.ts (`<ns>/{screenId,node,i18n,i18nParams,platform}`) are
// copied through so the IR can be rebuilt losslessly. The namespace is an argument.

import { JsxError } from "../errors";
import { sameName } from "./read-core";
import type { RawBoard, RawChild, RawFlex, RawNode, RawText, ReadQuery } from "./read-core";
import { setNameOf } from "./snapshot";

export const MAX_READ_NODES = 5000;

interface RFlex {
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

export interface ReadShape {
	readonly id: string;
	readonly type: string;
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly hidden?: boolean;
	readonly children?: ReadShape[];
	readonly flex?: RFlex | null;
	readonly layoutChild?: { horizontalSizing: string; verticalSizing: string } | null;
	readonly growType?: string;
	readonly characters?: string;
	readonly tokens?: Record<string, string> | null;
	getSharedPluginData(ns: string, key: string): string | null | undefined;
	isComponentInstance?(): boolean;
	component?(): ReadComponent | null;
}

export interface ReadComponent {
	readonly name: string;
	readonly path?: string;
	readonly variantProps?: Record<string, string> | null;
	readonly variants?: { readonly name?: string } | null;
	mainInstance(): ReadShape;
}

export interface ReadPage {
	readonly name: string;
	readonly root: ReadShape;
}

export interface ReadPenpot {
	readonly currentFile: { pages: ReadPage[] } | null;
}

type Base = { node?: string; w: number; h: number; child?: RawChild; tokens?: Record<string, string> };

const round = (n: number): number => Math.round(n * 100) / 100;

function tag(s: ReadShape, ns: string, key: string): string {
	// Live Penpot returns null (not "") for an unset key; callers only ever see a string.
	const v = s.getSharedPluginData(ns, key) as string | null | undefined;
	return typeof v === "string" ? v : "";
}

function tokensOf(s: ReadShape): Record<string, string> | undefined {
	let raw: Record<string, string> | null | undefined;
	try {
		raw = s.tokens;
	} catch {
		return undefined; // an older Penpot without shape.tokens: raw values only
	}
	if (!raw) return undefined;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v !== "") out[k] = v;
	return Object.keys(out).length > 0 ? out : undefined;
}

function textOf(s: ReadShape, ns: string): RawText {
	const out: RawText = { text: s.characters ?? "" };
	const key = tag(s, ns, "i18n");
	if (key !== "") {
		out.key = key;
		const p = tag(s, ns, "i18nParams");
		if (p !== "") {
			try {
				const parsed = JSON.parse(p) as Record<string, string | number>;
				if (Object.keys(parsed).length > 0) out.params = parsed;
			} catch {
				// a malformed tag is dropped; the key alone still identifies the copy
			}
		}
	}
	if (s.hidden === true) out.hidden = true;
	return out;
}

function flexOf(s: ReadShape): RawFlex | undefined {
	const f = s.flex;
	if (!f) return undefined;
	const out: RawFlex = { dir: f.dir };
	if (f.wrap === "wrap") out.wrap = true;
	out.align = f.alignItems;
	out.justify = f.justifyContent;
	if (f.rowGap) out.rowGap = round(f.rowGap);
	if (f.columnGap) out.columnGap = round(f.columnGap);
	const pad = [f.topPadding, f.rightPadding, f.bottomPadding, f.leftPadding].map((n) => round(n || 0)) as [
		number,
		number,
		number,
		number,
	];
	if (pad.some((n) => n !== 0)) out.pad = pad;
	out.hs = f.horizontalSizing;
	out.vs = f.verticalSizing;
	return out;
}

function childOf(s: ReadShape): RawChild | undefined {
	const lc = s.layoutChild;
	if (!lc) return undefined;
	return { h: lc.horizontalSizing, v: lc.verticalSizing };
}

function textLayers(root: ReadShape): Map<string, ReadShape> {
	const out = new Map<string, ReadShape>();
	const stack: ReadShape[] = [...(root.children ?? [])].reverse();
	while (stack.length > 0) {
		const s = stack.pop() as ReadShape;
		if (s.type === "text" && !out.has(s.name)) out.set(s.name, s);
		if (s.children) stack.push(...[...s.children].reverse());
	}
	return out;
}

function base(s: ReadShape, ns: string): Base {
	const out: Base = { w: round(s.width), h: round(s.height) };
	const node = tag(s, ns, "node");
	if (node !== "") out.node = node;
	const child = childOf(s);
	if (child) out.child = child;
	const tokens = tokensOf(s);
	if (tokens) out.tokens = tokens;
	return out;
}

function readCopy(s: ReadShape, ns: string): RawNode | undefined {
	const comp = s.component?.();
	if (!comp) return undefined;
	const main = comp.mainInstance();
	const mainLayers = textLayers(main);
	const slots: Record<string, RawText> = {};
	const same: Record<string, string> = {};
	for (const [layer, shape] of textLayers(s)) {
		const rt = textOf(shape, ns);
		const m = mainLayers.get(layer);
		const unchanged =
			m !== undefined &&
			rt.key === undefined &&
			rt.text === (m.characters ?? "") &&
			(rt.hidden === true) === (m.hidden === true);
		if (unchanged) same[layer] = m?.characters ?? "";
		else {
			// A hidden layer keeps its old characters; "hidden" means the empty string.
			slots[layer] = rt.hidden === true && rt.key === undefined ? { text: "", hidden: true } : rt;
		}
	}
	return {
		t: "copy",
		...base(s, ns),
		set: setNameOf(comp.path, comp.variants?.name ?? comp.name),
		props: { ...(comp.variantProps ?? {}) },
		mainW: round(main.width),
		mainH: round(main.height),
		slots,
		same,
	};
}

interface Walk {
	count: number;
	ns: string;
	t0: number;
	budgetMs?: number;
}

function readNode(s: ReadShape, w: Walk): RawNode {
	w.count += 1;
	if (w.count > MAX_READ_NODES) {
		throw new JsxError("BUDGET_EXCEEDED", `read budget of ${MAX_READ_NODES} nodes exceeded`);
	}
	if (w.budgetMs !== undefined && Date.now() - w.t0 > w.budgetMs) {
		throw new JsxError("BUDGET_EXCEEDED", `read budget of ${w.budgetMs} ms exceeded`);
	}
	if (s.isComponentInstance?.() === true) {
		return readCopy(s, w.ns) ?? { t: "other", ...base(s, w.ns), name: s.name, type: "component-copy" };
	}
	if (s.type === "board") {
		const out: RawNode = { t: "board", ...base(s, w.ns), name: s.name, children: [] };
		const flex = flexOf(s);
		if (flex) out.flex = flex;
		out.children = (s.children ?? []).map((c) => readNode(c, w));
		return out;
	}
	if (s.type === "text") {
		const out: RawNode = { t: "text", ...base(s, w.ns), text: textOf(s, w.ns) };
		if (s.growType) out.grow = s.growType;
		return out;
	}
	return { t: "other", ...base(s, w.ns), name: s.name, type: s.type };
}

export interface ReadOpts {
	/** Wall-clock budget; checked between shapes. */
	budgetMs?: number;
}

export function readBoard(board: ReadShape, page: string, ns: string, opts: ReadOpts = {}): RawBoard {
	const w: Walk = { count: 0, ns, t0: Date.now() };
	if (opts.budgetMs !== undefined) w.budgetMs = opts.budgetMs;
	const out: RawBoard = {
		boardId: board.id,
		page,
		name: board.name,
		w: round(board.width),
		h: round(board.height),
		children: (board.children ?? []).map((c) => readNode(c, w)),
	};
	const screenId = tag(board, ns, "screenId");
	if (screenId !== "") out.screenId = screenId;
	const platform = tag(board, ns, "platform");
	if (platform !== "") out.platform = platform;
	const flex = flexOf(board);
	if (flex) out.flex = flex;
	const tokens = tokensOf(board);
	if (tokens) out.tokens = tokens;
	return out;
}

export interface Found {
	board: ReadShape;
	page: string;
}

/** Top-level boards matching a screen id (preferred) or a board name. */
export function findBoards(pages: readonly ReadPage[], q: ReadQuery, ns: string): Found[] {
	const wanted = q.page;
	const scoped = wanted === undefined ? pages : pages.filter((p) => sameName(p.name, wanted));
	if (wanted !== undefined && scoped.length === 0) {
		throw new JsxError("BOARD_NOT_FOUND", `page "${wanted}" not found. Pages: ${pages.map((p) => p.name).join("; ")}`);
	}
	const all: Found[] = [];
	for (const p of scoped) {
		for (const c of p.root.children ?? []) if (c.type === "board") all.push({ board: c, page: p.name });
	}
	const byId = all.filter((f) => tag(f.board, ns, "screenId") === q.board);
	if (byId.length > 0) return byId;
	return all.filter((f) => f.board.name === q.board || sameName(f.board.name, q.board));
}

export function pick(found: readonly Found[], q: ReadQuery): Found {
	const first = found[0];
	if (first === undefined) throw new JsxError("BOARD_NOT_FOUND", `no board "${q.board}"${q.page ? ` on page "${q.page}"` : ""}`);
	if (found.length > 1) {
		const where = found.map((f) => `${f.page} / ${f.board.name} (${f.board.id})`).join("; ");
		throw new JsxError("BOARD_NOT_FOUND", `board "${q.board}" is ambiguous (${found.length}); pass --page. Matches: ${where}`);
	}
	return first;
}

export function locate(P: ReadPenpot, q: ReadQuery, ns: string): Found {
	return pick(findBoards(P.currentFile?.pages ?? [], q, ns), q);
}

export async function read(P: ReadPenpot, q: ReadQuery, ns: string, opts: ReadOpts = {}): Promise<RawBoard> {
	const { board, page } = locate(P, q, ns);
	return readBoard(board, page, ns, opts);
}
