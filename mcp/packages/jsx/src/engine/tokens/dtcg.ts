// GENERATED from nova-terra tools/design-bridge/src/engine/tokens/dtcg.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Penpot multi-set DTCG -> desired tokens (design §9.5). The inverse of `tokens/to-dtcg.ts`:
// `{"<set>": {group: {name: {$type, $value}}}}`, dotted token names nest as groups.
// Strict about shape, lenient about extras: keys starting with `$` other than `$type` and `$value`
// (`$themes`, `$metadata`, `$description`) are skipped. A group's `$type` is inherited by its tokens.

import { JsxError } from "../errors";
import type { DesiredToken, ShadowLayer, TokenValue } from "./model";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function invalid(message: string, path: string): JsxError {
	return new JsxError("TOKENS_INVALID", `tokens: ${message}`, { path });
}

function scalar(v: unknown, path: string): string {
	if (typeof v === "string") return v;
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	throw invalid(`$value must be a string or a finite number, got ${JSON.stringify(v)}`, path);
}

function layer(v: unknown, path: string): ShadowLayer {
	if (!isObj(v)) throw invalid("a shadow layer must be an object", path);
	const field = (k: string): string => {
		if (!(k in v)) throw invalid(`a shadow layer needs "${k}"`, path);
		return scalar(v[k], `${path}.${k}`);
	};
	return {
		offsetX: field("offsetX"),
		offsetY: field("offsetY"),
		blur: field("blur"),
		spread: field("spread"),
		color: field("color"),
		inset: v.inset === true || v.inset === "true",
	};
}

function valueOf(type: string, raw: unknown, path: string): TokenValue {
	if (type === "shadow") {
		const layers = Array.isArray(raw) ? raw : [raw];
		if (layers.length === 0) throw invalid("a shadow needs at least one layer", path);
		return layers.map((l, i) => layer(l, `${path}[${i}]`));
	}
	if (type === "fontFamilies") {
		const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : undefined;
		if (!list) throw invalid("fontFamilies must be a string or an array of strings", path);
		return list.map((x, i) => scalar(x, `${path}[${i}]`).trim());
	}
	return scalar(raw, path);
}

function walk(node: Obj, set: string, prefix: string[], inherited: string | undefined, out: DesiredToken[], path: string): void {
	const groupType = typeof node.$type === "string" ? node.$type : inherited;
	for (const [key, child] of Object.entries(node)) {
		if (key.startsWith("$")) continue;
		const at = `${path}.${key}`;
		if (!isObj(child)) throw invalid(`"${key}" must be a token or a group (object)`, at);
		const names = [...prefix, key];
		if ("$value" in child) {
			const type = typeof child.$type === "string" ? child.$type : groupType;
			if (type === undefined) throw invalid(`token "${names.join(".")}" has no $type`, at);
			out.push({ set, name: names.join("."), type, value: valueOf(type, child.$value, at) });
		} else {
			walk(child, set, names, groupType, out, at);
		}
	}
}

/** Parses a Penpot multi-set DTCG document. Invalid input throws `JsxError` `TOKENS_INVALID`. */
export function parseDtcg(doc: unknown): DesiredToken[] {
	if (!isObj(doc)) throw invalid("the document must be an object of sets", "$");
	const out: DesiredToken[] = [];
	for (const [set, body] of Object.entries(doc)) {
		if (set.startsWith("$")) continue;
		if (!isObj(body)) throw invalid(`set "${set}" must be an object`, set);
		walk(body, set, [], undefined, out, set);
	}
	return out;
}
