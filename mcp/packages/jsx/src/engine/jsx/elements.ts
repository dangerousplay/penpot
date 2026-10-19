// GENERATED from nova-terra tools/design-bridge/src/engine/jsx/elements.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// The JSON element tree the plugin evaluator returns and the server replays (design §4).
// `$` is the tag (a primitive or a registry tag), `p` the props, `c` the flattened children,
// `l` the 1-based source line.

import type { Node } from "../ir/schema";

export interface Element {
	$: string;
	p: Record<string, unknown>;
	c: unknown[];
	l?: number;
}

export const PRIMITIVE_TAGS = ["Screen", "Stack", "Row", "Box", "Text"] as const;

export function isElement(v: unknown): v is Element {
	return typeof v === "object" && v !== null && typeof (v as { $?: unknown }).$ === "string";
}

/** Registry tags used by the tree (primitives excluded), in first-use order. */
export function collectTags(elements: readonly Element[]): string[] {
	const seen = new Set<string>();
	const walk = (el: Element): void => {
		if (!(PRIMITIVE_TAGS as readonly string[]).includes(el.$)) seen.add(el.$);
		for (const child of el.c) if (isElement(child)) walk(child);
	};
	for (const el of elements) walk(el);
	return [...seen];
}

export function flattenChildren(children: unknown): Node[] {
	if (children === undefined || children === null || children === false) return [];
	if (Array.isArray(children)) return children.flatMap((c) => flattenChildren(c));
	return [children as Node];
}
