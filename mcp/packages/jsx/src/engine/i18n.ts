// GENERATED from nova-terra tools/design-bridge/src/engine/i18n.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Messages: lookup, interpolation and plurals for any locale (design §8; context D8).
// Accepts nested or flat messages. No module state: callers compile once and pass the result.

import { JsxError } from "./errors";
import type { TextValue } from "./ir/schema";
import type { RText } from "./push/render-model";

export type Messages = { [key: string]: Messages | string };

export interface CompiledMessages {
	/** Dotted key -> text. */
	readonly flat: ReadonlyMap<string, string>;
	/** Dotted paths that are objects (a lookup on one is "not a string", not "missing"). */
	readonly groups: ReadonlySet<string>;
}

/** Flattens nested messages; a flat key (a key with "." in it) wins over a nested path on conflict. */
export function compileMessages(messages: Messages): CompiledMessages {
	const flat = new Map<string, string>();
	const flatKeys = new Set<string>();
	const groups = new Set<string>();
	const walk = (node: Messages, prefix: string): void => {
		for (const [k, v] of Object.entries(node)) {
			const path = prefix === "" ? k : `${prefix}.${k}`;
			const isFlatKey = k.includes(".");
			if (typeof v === "string") {
				if (isFlatKey) {
					flat.set(path, v);
					flatKeys.add(path);
				} else if (!flatKeys.has(path)) flat.set(path, v);
			} else if (typeof v === "object" && v !== null) {
				groups.add(path);
				walk(v, path);
			}
		}
	};
	walk(messages, "");
	return { flat, groups };
}

/** Dotted lookup. Objects and missing keys are errors. */
export function lookup(c: CompiledMessages, key: string, locale: string): string {
	const hit = c.flat.get(key);
	if (hit !== undefined) return hit;
	if (c.groups.has(key)) {
		throw new JsxError("JSX_MISSING_MESSAGE", `i18n key "${key}" is not a string in locale "${locale}"`);
	}
	throw new JsxError("JSX_MISSING_MESSAGE", `i18n key "${key}" is missing in locale "${locale}"`);
}

const PARAM = /\{\{\s*([\w.]+)\s*\}\}/g;

/** `{{param}}` interpolation. A placeholder with no param is an error, not a silent blank. */
export function interpolate(
	template: string,
	params: Record<string, string | number> | undefined,
	key: string,
	locale: string,
): string {
	const out = template.replace(PARAM, (_m, name: string) => {
		const v = params?.[name];
		if (v === undefined) {
			throw new JsxError("JSX_INVALID_VALUE", `i18n key "${key}" (${locale}) needs param "${name}"`);
		}
		return String(v);
	});
	// A param value or a malformed placeholder can leave "{{" behind; never ship that to a design.
	if (out.includes("{{")) {
		throw new JsxError("JSX_INVALID_VALUE", `i18n key "${key}" (${locale}) has an unresolved "{{" after interpolation`);
	}
	return out;
}

/**
 * `key_one` / `key_other` (Intl.PluralRules of the locale) selected by `count`. A key with plural
 * siblings and no count has no single text, so it is an error rather than a guess.
 */
function pluralForm(
	c: CompiledMessages,
	key: string,
	locale: string,
	params: Record<string, string | number> | undefined,
): string | undefined {
	if (!c.flat.has(`${key}_one`) && !c.flat.has(`${key}_other`)) return undefined;
	const count = params?.count;
	if (count === undefined) {
		throw new JsxError("JSX_INVALID_VALUE", `i18n key "${key}" (${locale}) has plural forms and needs param "count"`);
	}
	const rule = new Intl.PluralRules(locale).select(Number(count));
	return lookup(c, c.flat.has(`${key}_${rule}`) ? `${key}_${rule}` : `${key}_other`, locale);
}

export interface TextOptions {
	messages?: CompiledMessages;
	locale: string;
	/** A missing key (or no messages at all) throws instead of falling back to the key. */
	strict?: boolean;
	warn?: (message: string) => void;
}

export function resolveText(value: TextValue, o: TextOptions): RText {
	if ("literal" in value) return { text: value.literal };
	let text: string;
	if (o.messages === undefined || !(o.messages.flat.has(value.key) || hasPluralSibling(o.messages, value.key))) {
		if (o.strict === true || (o.messages !== undefined && o.messages.groups.has(value.key))) {
			// Reuses the lookup errors: missing / not a string.
			if (o.messages) lookup(o.messages, value.key, o.locale);
			throw new JsxError("JSX_MISSING_MESSAGE", `t("${value.key}") needs messages: none were given for locale "${o.locale}"`);
		}
		o.warn?.(
			o.messages === undefined
				? `t("${value.key}"): no messages given; the key is used as text`
				: `i18n key "${value.key}" is missing in locale "${o.locale}"; the key is used as text`,
		);
		text = value.key;
	} else {
		const template = pluralForm(o.messages, value.key, o.locale, value.params) ?? lookup(o.messages, value.key, o.locale);
		text = interpolate(template, value.params, value.key, o.locale);
	}
	return value.params === undefined ? { key: value.key, text } : { key: value.key, params: value.params, text };
}

function hasPluralSibling(c: CompiledMessages, key: string): boolean {
	return c.flat.has(`${key}_one`) || c.flat.has(`${key}_other`);
}
