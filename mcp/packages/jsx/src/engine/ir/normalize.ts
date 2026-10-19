// GENERATED from nova-terra tools/design-bridge/src/engine/ir/normalize.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
import type { Dim, Node } from "./schema";

export type NormalizeOptions = {
	/**
	 * Canonicalise a Dim, so `{px}` can equal `{token}` when the token value equals
	 * the px. Identity by default; see {@link tokenValueDim}.
	 */
	canonicalDim?: (dim: Dim) => Dim;
	/**
	 * Pull compares against what Penpot reports, where "start" alignment and "nowrap"
	 * are the defaults and cannot be told apart from absent. Drops `align: "start"`,
	 * `justify: "start"` and `wrap: false` from layouts.
	 */
	penpotDefaults?: boolean;
};

/** `{token}` becomes `{px: <token value>}` (R7.2: `{px}` equals `{token}` when the values match). */
export function tokenValueDim(dim: Dim, spacing: Readonly<Record<string, number>>): Dim {
	if ("px" in dim) return dim;
	const px = Object.hasOwn(spacing, dim.token) ? spacing[dim.token] : undefined;
	return px === undefined ? dim : { px };
}

/** Auto-derived node ids look like `screenId/0/2` (design R3.9). */
const AUTO_ID = /^[^/]+(\/\d+)+$/;

export function isAutoId(id: string): boolean {
	return AUTO_ID.test(id);
}

function isDim(v: unknown): v is Dim {
	if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
	const keys = Object.keys(v);
	return keys.length === 1 && (keys[0] === "px" || keys[0] === "token");
}

function isLayout(src: Record<string, unknown>): boolean {
	return src.dir === "column" || src.dir === "row" || src.dir === "none";
}

/** Mirrors `effectiveSizing` in plugin/render-core.ts: the sizing the renderer applies when absent. */
function defaultSizing(kind: string, parentDir: string | undefined): { h: string; v: string } {
	return {
		h: kind === "component" ? "fix" : parentDir === "column" ? "fill" : "auto",
		v: kind === "component" ? "fix" : "auto",
	};
}

/** Drop `h`/`v` equal to the effective default; undefined when nothing is left. */
function stripDefaultSizing(
	lc: unknown,
	kind: string,
	parentDir: string | undefined,
): Record<string, unknown> | undefined {
	if (typeof lc !== "object" || lc === null) return undefined;
	const def = defaultSizing(kind, parentDir);
	const out: Record<string, unknown> = { ...(lc as Record<string, unknown>) };
	if (out.h === def.h) delete out.h;
	if (out.v === def.v) delete out.v;
	return Object.keys(out).length === 0 ? undefined : out;
}

function walk(value: unknown, opts: NormalizeOptions, parentDir?: string): unknown {
	if (Array.isArray(value)) return value.map((v) => walk(v, opts, parentDir));
	if (typeof value !== "object" || value === null) return value;
	if (opts.canonicalDim && isDim(value)) return opts.canonicalDim(value);
	const src = value as Record<string, unknown>;
	const isNode = typeof src.kind === "string";
	const layout = opts.penpotDefaults === true && !isNode && isLayout(src);
	const out: Record<string, unknown> = {};
	const ownDir =
		isNode && typeof src.layout === "object" && src.layout !== null
			? ((src.layout as Record<string, unknown>).dir as string | undefined)
			: undefined;
	for (const key of Object.keys(src).sort()) {
		let v = src[key];
		if (v === undefined) continue;
		if (opts.penpotDefaults === true && isNode && key === "layoutChild") {
			v = stripDefaultSizing(v, src.kind as string, parentDir);
			if (v === undefined) continue;
		}
		if (layout && ((key === "align" || key === "justify") && v === "start")) continue;
		if (layout && key === "wrap" && v === false) continue;
		if (
			isNode &&
			key === "id" &&
			src.kind !== "screen" &&
			typeof v === "string" &&
			AUTO_ID.test(v)
		) {
			continue;
		}
		out[key] = walk(v, opts, key === "children" ? ownDir : undefined);
	}
	return out;
}

/** Canonical form for equality: sorted keys, undefined dropped, auto ids dropped. */
export function normalize(node: Node, opts: NormalizeOptions = {}): unknown {
	return walk(node, opts);
}
