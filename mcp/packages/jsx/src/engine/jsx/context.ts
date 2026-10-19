// GENERATED from nova-terra tools/design-bridge/src/engine/jsx/context.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Re-entrant JSX context: the primitives (Screen, Stack, Row, Box, Text, t) and `component()`,
// backed by one call's registry, theme, messages, locale and strict flag (design §2.1, R1.2).
// Warnings and the `flex-1` bookkeeping live in the context, never in module state, so two
// contexts used concurrently share nothing.

import { JsxError } from "../errors";
import { compileMessages } from "../i18n";
import type { CompiledMessages, Messages } from "../i18n";
import { SCREEN_ID_PATTERN } from "../ir/schema";
import type { Chrome, Dim, Layout, LayoutChild, Node, Platform, ScreenNode, TextValue } from "../ir/schema";
import type { Profile } from "../profile";
import { buildComponent, expandChrome } from "../registry";
import type { ComponentInput, Registry } from "../registry";
import { resolve as resolveClasses } from "../tailwind";
import type { Theme } from "../theme";
import { flattenChildren } from "./elements";

/** A spacing token key (`"md"`) or a raw pixel number. */
export type DimInput = string | number;
export type PaddingInput = DimInput | readonly [DimInput, DimInput, DimInput, DimInput];

export type LayoutProps = {
	gap?: DimInput;
	padding?: PaddingInput;
	align?: Layout["align"];
	justify?: Layout["justify"];
	wrap?: boolean;
	className?: string;
	id?: string;
	name?: string;
	children?: unknown;
};

export type ScreenProps = {
	id: string;
	platform: Platform;
	title: string;
	chrome?: Chrome;
	className?: string;
	children?: unknown;
};

export type TextProps = {
	value?: TextValue;
	id?: string;
	className?: string;
	children?: unknown;
};

export interface JsxContextInit {
	registry: Registry;
	theme: Theme;
	/** When given, `t()` keys are checked against it (a missing key warns, or throws under `strict`). */
	messages?: Messages | CompiledMessages;
	locale?: string;
	/** Unknown classes, missing props, absent slots and unresolvable `t()` calls throw instead of warning. */
	strict?: boolean;
	/** Overrides `strict` for Tailwind classes only (the Nova Terra CLI `--strict`). */
	strictClasses?: boolean;
	profile?: Profile;
}

type Sized = { layoutChild?: LayoutChild };
type Resolved = ReturnType<typeof resolveClasses>;

export interface JsxContext {
	readonly registry: Registry;
	readonly theme: Theme;
	readonly locale: string;
	readonly strict: boolean;
	readonly profile: Profile | undefined;
	/** Warnings collected so far (live array). */
	readonly warnings: string[];
	takeWarnings(): string[];
	/** Makes unknown Tailwind classes throw; returns the previous setting. */
	setStrictClasses(strict: boolean): boolean;
	Screen(p: ScreenProps): ScreenNode;
	Stack(p: LayoutProps): Node;
	Row(p: LayoutProps): Node;
	Box(p: LayoutProps): Node;
	Text(p: TextProps): Node;
	t(key: string, params?: Record<string, string | number>): TextValue;
	/** A registry component by tag (canonical or alias): validates props and builds the IR node. */
	component(tag: string, props: ComponentInput & { className?: string }): Extract<Node, { kind: "component" }>;
	/** Registered components take only the sizing subset of Tailwind; anything else is dropped loudly. */
	applyComponentClasses(node: Sized, set: string, className: string | undefined): void;
}

function isEmpty(o: object): boolean {
	return Object.keys(o).length === 0;
}

function assertNoSlash(label: string, value: string): void {
	if (value.includes("/")) {
		throw new JsxError("JSX_INVALID_VALUE", `${label} "${value}" contains "/", which splits Penpot paths. Use " · " instead.`);
	}
}

function toDim(input: DimInput): Dim {
	return typeof input === "number" ? { px: input } : { token: input };
}

function toPadding(input: PaddingInput): [Dim, Dim, Dim, Dim] {
	if (typeof input === "string" || typeof input === "number") {
		const d = toDim(input);
		return [d, d, d, d];
	}
	return [toDim(input[0]), toDim(input[1]), toDim(input[2]), toDim(input[3])];
}

function buildLayout(dir: Layout["dir"], p: LayoutProps): Layout {
	const layout: Layout = { dir };
	if (p.gap !== undefined) layout.gap = toDim(p.gap);
	if (p.padding !== undefined) layout.padding = toPadding(p.padding);
	if (p.align !== undefined) layout.align = p.align;
	if (p.justify !== undefined) layout.justify = p.justify;
	if (p.wrap !== undefined) layout.wrap = p.wrap;
	return layout;
}

function compiled(m: Messages | CompiledMessages | undefined): CompiledMessages | undefined {
	if (m === undefined) return undefined;
	return m.flat instanceof Map && m.groups instanceof Set ? (m as CompiledMessages) : compileMessages(m as Messages);
}

export function createJsxContext(init: JsxContextInit): JsxContext {
	const { registry, theme, profile } = init;
	const locale = init.locale ?? "en";
	const strict = init.strict === true;
	let strictClasses = init.strictClasses ?? strict;
	const messages = compiled(init.messages);
	const warnings: string[] = [];
	/** Nodes that asked for `flex-1`; the parent knows the axis and resolves it in `childNodes`. */
	const growing = new WeakSet<object>();

	const warn = (message: string): void => {
		warnings.push(message);
	};

	function resolveClassName(className: string | undefined): Resolved {
		const r = resolveClasses(className ?? "", theme, { strict: strictClasses });
		warnings.push(...r.warnings);
		return r;
	}

	/** A recognised class that the target element cannot honour is dropped loudly, never silently. */
	function warnDropped(target: string, className: string | undefined, what: string): void {
		warn(`${what} class on ${target} is ignored (className="${className ?? ""}")`);
	}

	/** Records a resolved class string's sizing (and `flex-1`) on a node. */
	function applySizingClasses(node: Sized, r: Resolved): void {
		if (!isEmpty(r.layoutChild)) node.layoutChild = r.layoutChild;
		if (r.grow) growing.add(node);
	}

	function applyComponentClasses(node: Sized, set: string, className: string | undefined): void {
		const r = resolveClassName(className);
		if (!isEmpty(r.layout) || !isEmpty(r.style)) warnDropped(set, className, "layout and style");
		applySizingClasses(node, r);
	}

	function childNodes(children: unknown, dir: Layout["dir"]): Node[] {
		const nodes = flattenChildren(children);
		for (const n of nodes) {
			if (typeof n !== "object" || n === null || !("kind" in n)) {
				throw new JsxError("JSX_INVALID_NODE", "only design nodes are allowed as children; wrap strings in <Text>.");
			}
			if (n.kind === "screen" || !growing.has(n)) continue;
			growing.delete(n);
			if (dir === "none") {
				warn("flex-1 needs a Stack or Row parent; ignored");
				continue;
			}
			n.layoutChild = { ...n.layoutChild, [dir === "column" ? "v" : "h"]: "fill" };
		}
		return nodes;
	}

	function frame(dir: Layout["dir"], p: LayoutProps): Node {
		if (p.name !== undefined) assertNoSlash("name", p.name);
		const r = resolveClassName(p.className);
		if (dir !== "none" && r.layout.dir !== undefined && r.layout.dir !== dir) {
			warnDropped(dir === "column" ? "Stack" : "Row", p.className, `${r.layout.dir === "row" ? "flex-row" : "flex-col"} direction`);
		}
		// Explicit props win over classes; Stack/Row fix dir, Box takes it from classes.
		const layout: Layout = {
			...r.layout,
			...buildLayout(dir === "none" ? (r.layout.dir ?? "none") : dir, p),
		};
		const node: Extract<Node, { kind: "frame" }> = {
			kind: "frame",
			layout,
			style: r.style,
			children: childNodes(p.children, layout.dir),
		};
		applySizingClasses(node, r);
		if (p.id !== undefined) node.id = p.id;
		if (p.name !== undefined) node.name = p.name;
		return node;
	}

	function Screen(p: ScreenProps): ScreenNode {
		if (!SCREEN_ID_PATTERN.test(p.id)) {
			throw new JsxError("JSX_INVALID_VALUE", `screen id "${p.id}" must match ${SCREEN_ID_PATTERN.source}`);
		}
		assertNoSlash("title", p.title);
		const r = resolveClassName(p.className);
		if (r.layout.dir !== undefined && r.layout.dir !== "column") {
			warnDropped("Screen", p.className, "direction (a Screen is always a column)");
		}
		if (!isEmpty(r.style) || !isEmpty(r.layoutChild)) {
			warn(`screen "${p.id}" className only supports layout classes; style and sizing ignored`);
		}
		const node: ScreenNode = {
			kind: "screen",
			id: p.id,
			platform: p.platform,
			title: p.title,
			layout: { ...r.layout, dir: "column" },
			children: childNodes(p.children, "column"),
		};
		if (p.chrome) {
			// Chrome flags are authoring sugar: expand them into component nodes.
			const { top, bottom } = expandChrome(registry, p.platform, p.chrome);
			node.children = [...top, ...node.children, ...bottom];
		}
		return node;
	}

	function Text(p: TextProps): Node {
		let value: TextValue | undefined = p.value;
		if (value === undefined) {
			const parts = flattenChildren(p.children) as unknown[];
			if (parts.length === 0) {
				throw new JsxError("JSX_INVALID_PROP", "<Text> needs a value prop or children; got neither.");
			}
			const only = parts[0];
			if (parts.length === 1 && typeof only === "object" && only !== null && "key" in only) {
				value = only as TextValue;
			} else if (parts.every((c) => typeof c === "string" || typeof c === "number")) {
				value = { literal: parts.join("") };
			} else {
				throw new JsxError("JSX_INVALID_NODE", "<Text> children must be strings or a single t() value.");
			}
		}
		checkText(value);
		const r = resolveClassName(p.className);
		if (!isEmpty(r.layout)) warnDropped("Text", p.className, "layout (gap, padding, direction, alignment)");
		const node: Extract<Node, { kind: "text" }> = { kind: "text", value, style: r.style };
		if (p.id !== undefined) node.id = p.id;
		applySizingClasses(node, r);
		return node;
	}

	/** A `t()` value built in the plugin sandbox never went through `t` here, so check its key on arrival. */
	function checkText(v: unknown): void {
		if (typeof v === "object" && v !== null && "key" in v && typeof (v as { key: unknown }).key === "string") {
			const tv = v as { key: string; params?: Record<string, string | number> };
			t(tv.key, tv.params);
		}
	}

	function t(key: string, params?: Record<string, string | number>): TextValue {
		const value: TextValue = params === undefined ? { key } : { key, params };
		if (messages === undefined) {
			if (strict) {
				throw new JsxError("JSX_MISSING_MESSAGE", `t("${key}") needs messages: none were given for locale "${locale}"`);
			}
			return value;
		}
		if (!messages.flat.has(key) && !messages.flat.has(`${key}_one`) && !messages.flat.has(`${key}_other`)) {
			const msg = `i18n key "${key}" is missing in locale "${locale}"`;
			if (strict) throw new JsxError("JSX_MISSING_MESSAGE", msg);
			warn(`${msg}; the key is used as text`);
		}
		return value;
	}

	return {
		registry,
		theme,
		locale,
		strict,
		profile,
		warnings,
		takeWarnings: () => warnings.splice(0),
		setStrictClasses(next) {
			const prev = strictClasses;
			strictClasses = next;
			return prev;
		},
		Screen,
		Stack: (p) => frame("column", p),
		Row: (p) => frame("row", p),
		Box: (p) => frame("none", p),
		Text,
		t,
		component(tag, props) {
			const { className, ...rest } = props;
			const node = buildComponent(registry, tag, rest, { strict, warn });
			for (const v of Object.values(node.slots)) checkText(v);
			if (className !== undefined) applyComponentClasses(node, tag, className);
			return node;
		},
		applyComponentClasses,
	};
}
