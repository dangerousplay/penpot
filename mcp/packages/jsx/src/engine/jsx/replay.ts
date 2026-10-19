// GENERATED from nova-terra tools/design-bridge/src/engine/jsx/replay.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Replay: turns the plugin's element tree into IR screens by calling one context's primitives
// and `component()`. No user code runs here; every failure is a JsxError with `line` and `path`
// (design §4).

import { JsxError, isJsxError } from "../errors";
import { collectScreens } from "../ir/collect";
import type { Node, ScreenNode } from "../ir/schema";
import { createJsxContext } from "./context";
import type { JsxContext, JsxContextInit } from "./context";
import { isElement } from "./elements";
import type { Element } from "./elements";

export interface ReplayResult {
	screens: ScreenNode[];
	warnings: string[];
}

function annotate(e: unknown, el: Element, path: string): JsxError {
	const err = isJsxError(e) ? e : new JsxError("JSX_INVALID_NODE", e instanceof Error ? e.message : String(e));
	if (err.path === undefined) err.path = path;
	if (err.line === undefined && el.l !== undefined) err.line = el.l;
	return err;
}

function build(el: Element, ctx: JsxContext, path: string): Node {
	try {
		const children = el.c.map((c) => (isElement(c) ? build(c, ctx, `${path} > ${c.$}`) : c));
		const props = el.p;
		switch (el.$) {
			case "Screen":
				return ctx.Screen({ ...props, children } as Parameters<JsxContext["Screen"]>[0]);
			case "Stack":
				return ctx.Stack({ ...props, children });
			case "Row":
				return ctx.Row({ ...props, children });
			case "Box":
				return ctx.Box({ ...props, children });
			case "Text":
				return ctx.Text({ ...props, children });
			default:
				if (children.length > 0) ctx.warnings.push(`<${el.$}> children are ignored; pass copy through slot props`);
				return ctx.component(el.$, props);
		}
	} catch (e) {
		throw annotate(e, el, path);
	}
}

/** Replays `elements` (the default export's screens) through a fresh context built from `init`. */
export function replay(elements: readonly Element[], init: JsxContextInit): ReplayResult {
	const ctx = createJsxContext(init);
	const built = elements.map((el, i) => build(el, ctx, `screens[${i}]`));
	const screens = collectScreens(built, "the source");
	const warnings = [...new Set([...ctx.registry.warnings, ...ctx.warnings])];
	return { screens, warnings };
}
