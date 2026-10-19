// GENERATED from nova-terra tools/design-bridge/src/engine/tailwind.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
import { JsxError } from "./errors";
import type { Dim, Layout, LayoutChild, StyleRefs } from "./ir/schema";
import type { Theme } from "./theme";

export type ResolvedClasses = {
	/** `dir` is present only when `flex` / `flex-col` / `flex-row` was given. */
	layout: Partial<Layout>;
	style: StyleRefs;
	layoutChild: LayoutChild;
	/** `flex-1`: fill the parent's main axis; the axis depends on the parent, so the parent applies it. */
	grow?: true;
	warnings: string[];
};

export type ResolveOptions = { strict?: boolean };

const ALIGN = ["start", "center", "end", "stretch"] as const;
const JUSTIFY = ["start", "center", "end", "between"] as const;

const SCALE = /^\d+(\.\d+)?$/;
const ARBITRARY_PX = /^\[(-?\d+(?:\.\d+)?)px\]$/;

/** `4` / `md` / `[12px]` to a Dim; undefined when not understood. */
function parseDim(raw: string, theme: Theme): Dim | undefined {
	if (Object.hasOwn(theme.spacing, raw)) return { token: raw };
	const px = parsePx(raw);
	if (px === undefined) return undefined;
	for (const [key, entry] of Object.entries(theme.spacing)) if (entry.value === px) return { token: key };
	return { px };
}

function parsePx(raw: string): number | undefined {
	const m = ARBITRARY_PX.exec(raw);
	if (m) return Number(m[1]);
	if (SCALE.test(raw)) return Number(raw) * 4;
	return undefined;
}

function oneOf<T extends string>(list: readonly T[], v: string): T | undefined {
	return list.find((x) => x === v);
}

const ZERO: Dim = { px: 0 };

/** padding side indexes: top 0, right 1, bottom 2, left 3 */
const PADDING: Record<string, readonly number[]> = {
	p: [0, 1, 2, 3],
	px: [1, 3],
	py: [0, 2],
	pt: [0],
	pr: [1],
	pb: [2],
	pl: [3],
};

/** Resolve a Tailwind class string over the closed R4.1 table; color/spacing/radius/shadow keys come from `theme`. */
export function resolve(classes: string, theme: Theme, opts: ResolveOptions = {}): ResolvedClasses {
	const out: ResolvedClasses = { layout: {}, style: {}, layoutChild: {}, warnings: [] };
	let pad: [Dim, Dim, Dim, Dim] | undefined;

	for (const cls of classes.split(/\s+/).filter(Boolean)) {
		if (!apply(cls)) {
			const msg = `unknown Tailwind class "${cls}"`;
			if (opts.strict) throw new JsxError("JSX_INVALID_VALUE", msg);
			out.warnings.push(msg);
		}
	}
	if (pad) out.layout.padding = pad;
	return out;

	function apply(cls: string): boolean {
		if (cls === "flex" || cls === "flex-row") {
			out.layout.dir = "row";
			return true;
		}
		if (cls === "flex-col") {
			out.layout.dir = "column";
			return true;
		}
		if (cls === "flex-wrap") {
			out.layout.wrap = true;
			return true;
		}
		if (cls === "flex-1") {
			out.grow = true;
			return true;
		}
		if (cls === "w-full") {
			out.layoutChild.h = "fill";
			return true;
		}
		if (cls === "h-full") {
			out.layoutChild.v = "fill";
			return true;
		}

		const dash = cls.indexOf("-");
		if (dash <= 0) return false;
		const head = cls.slice(0, dash);
		const rest = cls.slice(dash + 1);

		switch (head) {
			case "gap": {
				const d = parseDim(rest, theme);
				if (!d) return false;
				out.layout.gap = d;
				return true;
			}
			case "p":
			case "px":
			case "py":
			case "pt":
			case "pr":
			case "pb":
			case "pl": {
				const d = parseDim(rest, theme);
				if (!d) return false;
				pad ??= [ZERO, ZERO, ZERO, ZERO];
				for (const i of PADDING[head]!) pad[i] = d;
				return true;
			}
			case "items": {
				const v = oneOf(ALIGN, rest);
				if (!v) return false;
				out.layout.align = v;
				return true;
			}
			case "justify": {
				const v = oneOf(JUSTIFY, rest);
				if (!v) return false;
				out.layout.justify = v;
				return true;
			}
			case "w":
			case "h": {
				const px = parsePx(rest);
				if (px === undefined) return false;
				if (head === "w") {
					out.layoutChild.h = "fix";
					out.layoutChild.width = px;
				} else {
					out.layoutChild.v = "fix";
					out.layoutChild.height = px;
				}
				return true;
			}
			case "bg":
			case "text":
				if (!Object.hasOwn(theme.colors, rest)) return false;
				out.style.fill = rest;
				return true;
			case "border":
				if (!Object.hasOwn(theme.colors, rest)) return false;
				out.style.stroke = rest;
				return true;
			case "rounded":
				if (!Object.hasOwn(theme.radius, rest)) return false;
				out.style.radius = rest;
				return true;
			case "shadow":
				if (!Object.hasOwn(theme.shadow, rest)) return false;
				out.style.shadow = rest;
				return true;
			default:
				return false;
		}
	}
}

function dimClass(d: Dim): string {
	if ("token" in d) return d.token;
	return Number.isInteger(d.px / 4) && d.px >= 0 ? String(d.px / 4) : `[${d.px}px]`;
}

const same = (a: Dim, b: Dim): boolean => JSON.stringify(a) === JSON.stringify(b);

export type ToClassesOptions = {
	/** Direction of the parent: a fill on its main axis is emitted as `flex-1`. */
	parentDir?: Layout["dir"];
	/** Emit `text-{color}` instead of `bg-{color}` for the fill (text nodes). */
	text?: boolean;
};

/**
 * Canonical inverse of {@link resolve}. Fixed order: layout, spacing, sizing,
 * color, radius, shadow. `resolve(toClasses(x))` deep-equals `x` for every
 * value the forward map can produce (dir "none" is the absence of `dir`).
 */
export function toClasses(
	layout: Partial<Layout> = {},
	style: StyleRefs = {},
	layoutChild: LayoutChild = {},
	opts: ToClassesOptions = {},
): string {
	const c: string[] = [];
	// layout
	if (layout.dir === "column") c.push("flex-col");
	else if (layout.dir === "row") c.push("flex-row");
	if (layout.wrap) c.push("flex-wrap");
	if (layout.align) c.push(`items-${layout.align}`);
	if (layout.justify) c.push(`justify-${layout.justify}`);
	// spacing
	if (layout.gap) c.push(`gap-${dimClass(layout.gap)}`);
	if (layout.padding) {
		const [t, r, b, l] = layout.padding;
		if (same(t, r) && same(r, b) && same(b, l)) c.push(`p-${dimClass(t)}`);
		else if (same(t, b) && same(r, l)) c.push(`py-${dimClass(t)}`, `px-${dimClass(r)}`);
		else
			c.push(`pt-${dimClass(t)}`, `pr-${dimClass(r)}`, `pb-${dimClass(b)}`, `pl-${dimClass(l)}`);
	}
	// sizing
	const growH = layoutChild.h === "fill" && opts.parentDir === "row";
	const growV = layoutChild.v === "fill" && opts.parentDir === "column";
	if (growH || growV) c.push("flex-1");
	if (layoutChild.h === "fill" && !growH) c.push("w-full");
	else if (layoutChild.h === "fix" && layoutChild.width !== undefined)
		c.push(`w-[${layoutChild.width}px]`);
	if (layoutChild.v === "fill" && !growV) c.push("h-full");
	else if (layoutChild.v === "fix" && layoutChild.height !== undefined)
		c.push(`h-[${layoutChild.height}px]`);
	// color
	if (style.fill) c.push(`${opts.text ? "text" : "bg"}-${style.fill}`);
	if (style.stroke) c.push(`border-${style.stroke}`);
	// radius, shadow
	if (style.radius) c.push(`rounded-${style.radius}`);
	if (style.shadow) c.push(`shadow-${style.shadow}`);
	return c.join(" ");
}
