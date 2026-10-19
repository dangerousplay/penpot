// GENERATED from nova-terra tools/design-bridge/src/engine/ir/collect.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Screen validation shared by every evaluator lane. Pure: no fs, no path.

import { JsxError } from "../errors";
import { NodeSchema } from "./schema";
import type { ScreenNode } from "./schema";

/** Validates a module's default export: one Screen or an array of them, with unique ids. */
export function collectScreens(rawDefault: unknown, label: string): ScreenNode[] {
	if (rawDefault === undefined) {
		throw new JsxError("JSX_NO_SCREENS", `${label} has no default export`);
	}
	const raw: unknown[] = Array.isArray(rawDefault) ? rawDefault : [rawDefault];
	const screens: ScreenNode[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		const parsed = NodeSchema.safeParse(item);
		if (!parsed.success) {
			throw new JsxError("JSX_INVALID_NODE", `invalid IR in ${label}: ${parsed.error.message}`);
		}
		const node = parsed.data;
		if (node.kind !== "screen") {
			throw new JsxError("JSX_NO_SCREENS", `default export of ${label} must be <Screen> elements`);
		}
		if (seen.has(node.id)) {
			throw new JsxError("JSX_DUPLICATE_SCREEN", `duplicate screen id "${node.id}" in ${label}`);
		}
		seen.add(node.id);
		screens.push(node);
	}
	return screens;
}
