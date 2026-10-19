// GENERATED from nova-terra tools/design-bridge/src/engine/pull/core.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Pure pull/compare logic: read-result unwrapping, IR reconstruction, structural diff.
// No Node, no DOM. The tool shell (CLI or MCP) supplies the registry, theme and messages.

import { emitJsx } from "../emit/jsx";
import type { CompiledMessages } from "../i18n";
import { normalize, tokenValueDim } from "../ir/normalize";
import type { ScreenNode } from "../ir/schema";
import type { Profile } from "../profile";
import type { Registry } from "../registry";
import type { Theme } from "../theme";
import type { RawBoard } from "./raw";
import { formatDrift, reconcileDropped, toIr } from "./to-ir";

/** Everything pull and compare need, bound per call. */
export interface PullCtx {
	registry: Registry;
	theme: Theme;
	/** COPY-DRIFT is computed only when messages are given. */
	messages?: CompiledMessages;
	locale: string;
	profile?: Profile;
	/** Module the emitted source imports from (default `@penpot/jsx`). */
	importFrom?: string;
}

/** Accepts the raw read result or an MCP-style `{"result": <raw>}` wrapper (object or JSON string). */
export function unwrapRead(parsed: unknown): RawBoard {
	let cur = parsed;
	if (typeof cur === "string") cur = JSON.parse(cur);
	// MCP content array: [{"type":"text","text":"{\"result\": ...}"}]
	if (Array.isArray(cur)) {
		const item = cur.find((c) => c && typeof c === "object" && (c as { type?: unknown }).type === "text") as { text?: unknown } | undefined;
		if (!item || typeof item.text !== "string") throw new Error("input is not a design-bridge read result (no text item)");
		cur = JSON.parse(item.text);
	}
	if (cur && typeof cur === "object" && "result" in cur && !("children" in cur)) {
		cur = (cur as { result: unknown }).result;
		if (typeof cur === "string") cur = JSON.parse(cur);
	}
	const raw = cur as Partial<RawBoard> | null;
	if (!raw || !Array.isArray(raw.children) || typeof raw.name !== "string") {
		throw new Error("input is not a design-bridge read result (missing name/children)");
	}
	return raw as RawBoard;
}

export interface Pulled {
	jsx: string;
	screen: ScreenNode;
	warnings: string[];
	copyDrift: string[];
}

/** Board -> IR -> source. */
export function pullBoard(raw: RawBoard, ctx: PullCtx): Pulled {
	const ir = toIr(raw, ctx.messages === undefined ? { theme: ctx.theme, locale: ctx.locale } : { theme: ctx.theme, locale: ctx.locale, messages: ctx.messages });
	const emitted = emitJsx([ir.screen], emitCtx(ctx));
	return {
		jsx: emitted.source,
		screen: ir.screen,
		warnings: [...ir.warnings, ...emitted.warnings],
		copyDrift: ir.drift.map(formatDrift),
	};
}

function emitCtx(ctx: PullCtx): { registry: Registry; theme: Theme; importFrom?: string } {
	return ctx.importFrom === undefined ? { registry: ctx.registry, theme: ctx.theme } : { registry: ctx.registry, theme: ctx.theme, importFrom: ctx.importFrom };
}

export interface DiffEntry {
	path: string;
	expected?: unknown;
	actual?: unknown;
}

/** Minimal structural diff over normalized IR (plain JSON). */
export function deepDiff(a: unknown, b: unknown, at = "$"): DiffEntry[] {
	if (JSON.stringify(a) === JSON.stringify(b)) return [];
	const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
	if (Array.isArray(a) && Array.isArray(b)) {
		const out: DiffEntry[] = [];
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			if (i >= a.length) out.push({ path: `${at}[${i}]`, actual: b[i] });
			else if (i >= b.length) out.push({ path: `${at}[${i}]`, expected: a[i] });
			else out.push(...deepDiff(a[i], b[i], `${at}[${i}]`));
		}
		return out;
	}
	if (isObj(a) && isObj(b)) {
		const out: DiffEntry[] = [];
		for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
			if (!(k in a)) out.push({ path: `${at}.${k}`, actual: b[k] });
			else if (!(k in b)) out.push({ path: `${at}.${k}`, expected: a[k] });
			else out.push(...deepDiff(a[k], b[k], `${at}.${k}`));
		}
		return out;
	}
	return [{ path: at, expected: a, actual: b }];
}

export interface Compared {
	equal: boolean;
	diffs: DiffEntry[];
	warnings: string[];
	copyDrift: string[];
}

/** R7.2: authored IR vs the IR pulled back from the board; ids, `{px}`/`{token}` and Penpot defaults are normalized. */
export function compareScreen(authored: ScreenNode, raw: RawBoard, ctx: PullCtx): Compared {
	const back = toIr(raw, ctx.messages === undefined ? { theme: ctx.theme, locale: ctx.locale } : { theme: ctx.theme, locale: ctx.locale, messages: ctx.messages });
	const spacing = Object.fromEntries(Object.entries(ctx.theme.spacing).map(([k, v]) => [k, v.value]));
	const opts = { canonicalDim: (d: Parameters<typeof tokenValueDim>[0]) => tokenValueDim(d, spacing), penpotDefaults: true };
	const left = normalize(reconcileDropped(authored, back.dropped), opts);
	const right = normalize(back.screen, opts);
	const diffs = deepDiff(left, right);
	return { equal: diffs.length === 0, diffs, warnings: back.warnings, copyDrift: back.drift.map(formatDrift) };
}
