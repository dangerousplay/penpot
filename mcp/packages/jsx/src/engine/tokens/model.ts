// GENERATED from nova-terra tools/design-bridge/src/engine/tokens/model.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Pure token model shared by the CLI (gen/check) and the Penpot plugin (push).
// No imports: this file is bundled into the plugin IIFE.

export interface ShadowLayer {
	offsetX: string;
	offsetY: string;
	blur: string;
	spread: string;
	color: string;
	inset: boolean;
}

/** Normalised value: string for scalars, string[] for fontFamilies, ShadowLayer[] for shadow. */
export type TokenValue = string | string[] | ShadowLayer[];

export interface DesiredToken {
	set: string;
	name: string;
	type: string;
	value: TokenValue;
}

export interface PenpotSetLike {
	name: string;
	tokens: { name: string; type: string; value: unknown }[];
}

export interface Change {
	set: string;
	name: string;
	type: string;
	action: "add" | "update" | "replace";
	value: TokenValue;
	from?: string;
}

export interface TokenDiff {
	changes: Change[];
	unchanged: string[];
	penpotOnly: string[];
	unrepresentable: Unrepresentable[];
	aliasConflicts: AliasConflict[];
}

export interface AliasConflict {
	token: string;
	alias: string;
	resolved: string;
	code: string;
}

export interface Conflict {
	token: string;
	reason: "type mismatch";
	code: string;
	penpot: string;
}

export interface Unrepresentable {
	token: string;
	reason: "negative spread";
	code: string;
	penpot: string;
}

export interface TokenReport {
	added: number;
	updated: number;
	unchanged: number;
	penpotOnly: number;
	/** Code values Penpot cannot hold; left untouched, never a failure. */
	unrepresentable: Unrepresentable[];
	/** Type mismatches: report-only, never written or deleted; a human resolves them. */
	conflicts: Conflict[];
	/** Penpot aliases whose resolved value drifts from code; left untouched. */
	aliasConflicts: AliasConflict[];
	setsCreated: number;
	details: {
		added: string[];
		updated: { token: string; from: string; to: string }[];
		penpotOnly: string[];
	};
}

const REF = /^\{([^{}]+)\}$/;

export function normColor(s: string): string {
	return s.replace(/\s+/g, "").toLowerCase();
}

function normScalar(type: string, v: unknown): string {
	const s = String(v).trim();
	if (type === "color") return normColor(s);
	const n = s.replace(/px$/, "");
	return n !== "" && !Number.isNaN(Number(n)) ? String(Number(n)) : s;
}

function num(v: unknown): string {
	return normScalar("spacing", v);
}

/** Canonical comparable text of a value (aliases resolved against `lookup`). */
export function canon(type: string, value: unknown, lookup: Map<string, unknown>, depth = 0): string {
	if (typeof value === "string") {
		const m = REF.exec(value.trim());
		if (m && depth < 10 && lookup.has(m[1] as string)) {
			return canon(type, lookup.get(m[1] as string), lookup, depth + 1);
		}
	}
	if (type === "shadow") {
		const layers = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
		return JSON.stringify(
			layers.map((l) => [
				num(l.offsetX),
				num(l.offsetY),
				num(l.blur),
				num(l.spread),
				canon("color", l.color, lookup, depth + 1),
				String(l.inset) === "true",
			]),
		);
	}
	if (type === "fontFamilies") {
		const arr = Array.isArray(value) ? value : String(value).split(",");
		return JSON.stringify(arr.map((x) => String(x).trim()));
	}
	return normScalar(type, value);
}

function lookupOf(sets: PenpotSetLike[]): Map<string, unknown> {
	const m = new Map<string, unknown>();
	for (const s of sets) for (const t of s.tokens) m.set(t.name, t.value);
	return m;
}

/** Diff the code-owned tokens against Penpot's current sets. Never plans a delete. */
export function diffTokens(desired: DesiredToken[], sets: PenpotSetLike[]): TokenDiff {
	const lookup = lookupOf(sets);
	const changes: Change[] = [];
	const unchanged: string[] = [];
	const unrepresentable: Unrepresentable[] = [];
	const aliasConflicts: AliasConflict[] = [];
	const wanted = new Set<string>();
	for (const d of desired) {
		wanted.add(`${d.set}::${d.name}`);
		const cur = sets.find((s) => s.name === d.set)?.tokens.find((t) => t.name === d.name);
		const label = `${d.set}::${d.name}`;
		if (d.type === "shadow" && (d.value as ShadowLayer[]).some((l) => Number(l.spread) < 0)) {
			// Penpot 2.18 rejects negative spread: keep its (approximated) value.
			unrepresentable.push({
				token: label,
				reason: "negative spread",
				code: canon(d.type, d.value, lookup),
				penpot: cur ? canon(cur.type, cur.value, lookup) : "(absent)",
			});
			wanted.add(label);
			continue;
		}
		if (!cur) {
			changes.push({ set: d.set, name: d.name, type: d.type, action: "add", value: d.value });
			continue;
		}
		const from = canon(cur.type, cur.value, lookup);
		const to = canon(d.type, d.value, lookup);
		if (cur.type === d.type && from === to) {
			unchanged.push(label);
			continue;
		}
		if (cur.type === d.type && typeof cur.value === "string" && REF.test(cur.value.trim())) {
			aliasConflicts.push({ token: label, alias: cur.value.trim(), resolved: from, code: to });
			continue;
		}
		changes.push({
			set: d.set,
			name: d.name,
			type: d.type,
			action: cur.type === d.type ? "update" : "replace",
			value: d.value,
			from: cur.type === d.type ? from : `${cur.type}:${from}`,
		});
	}
	const penpotOnly: string[] = [];
	for (const s of sets) {
		for (const t of s.tokens) {
			const label = `${s.name}::${t.name}`;
			if (!wanted.has(label)) penpotOnly.push(label);
		}
	}
	return { changes, unchanged, penpotOnly, unrepresentable, aliasConflicts };
}

export function reportOf(diff: TokenDiff): TokenReport {
	const added = diff.changes.filter((c) => c.action === "add");
	const updated = diff.changes.filter((c) => c.action === "update");
	const replaced = diff.changes.filter((c) => c.action === "replace");
	return {
		added: added.length,
		updated: updated.length,
		unchanged: diff.unchanged.length,
		penpotOnly: diff.penpotOnly.length,
		unrepresentable: diff.unrepresentable,
		conflicts: replaced.map((c) => ({
			token: `${c.set}::${c.name}`,
			reason: "type mismatch" as const,
			code: `${c.type}:${canon(c.type, c.value, new Map())}`,
			penpot: c.from ?? "",
		})),
		aliasConflicts: diff.aliasConflicts,
		setsCreated: 0,
		details: {
			added: added.map((c) => `${c.set}::${c.name}`),
			updated: updated.map((c) => ({
				token: `${c.set}::${c.name}`,
				from: c.from ?? "",
				to: canon(c.type, c.value, new Map()),
			})),
			penpotOnly: diff.penpotOnly,
		},
	};
}
