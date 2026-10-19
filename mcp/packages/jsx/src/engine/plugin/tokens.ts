// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/tokens.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot. Upserts code tokens into the local TokenCatalog; never deletes or replaces.
// `penpot` is an argument. Token bindings apply asynchronously and a shadow token rejects a negative
// spread (the diff reports it as unrepresentable), so this module only writes plain upserts.
import { JsxError } from "../errors";
import { diffTokens, reportOf } from "../tokens/model";
import type { Change, DesiredToken, PenpotSetLike, TokenReport, TokenValue } from "../tokens/model";

interface LiveToken {
	name: string;
	type: string;
	value: unknown;
}
interface LiveSet {
	name: string;
	tokens: LiveToken[];
	addToken(a: { type: string; name: string; value: unknown }): LiveToken;
}
interface LiveCatalog {
	sets: LiveSet[];
	addSet(a: { name: string; active?: boolean }): LiveSet;
}

function toPenpotValue(type: string, v: TokenValue): unknown {
	if (type === "shadow") {
		return (v as Exclude<TokenValue, string | string[]>).map((l) => ({ ...l }));
	}
	return v;
}

export interface TokensPenpot {
	readonly library: { readonly local: { readonly tokens: unknown } };
}

export interface TokensOpts {
	dryRun?: boolean;
	/** Wall-clock budget; checked between tokens. */
	budgetMs?: number;
}

export async function tokens(P: TokensPenpot, desired: DesiredToken[], opts: TokensOpts = {}): Promise<TokenReport> {
	const t0 = Date.now();
	const cat = P.library.local.tokens as LiveCatalog;
	const read = (): PenpotSetLike[] =>
		cat.sets.map((s) => ({
			name: s.name,
			tokens: s.tokens.map((t) => ({
				name: t.name,
				type: t.type,
				value: JSON.parse(JSON.stringify(t.value ?? null)) as unknown,
			})),
		}));
	const diff = diffTokens(desired, read());
	const report = reportOf(diff);
	if (opts.dryRun) return report;
	// Writes: addToken for missing tokens and same-type value updates only. Never delete/replace.
	const bySet = new Map<string, Change[]>();
	for (const c of diff.changes) {
		if (c.action === "replace") continue;
		bySet.set(c.set, [...(bySet.get(c.set) ?? []), c]);
	}
	for (const [setName, changes] of bySet) {
		let set = cat.sets.find((x) => x.name === setName);
		if (!set) {
			set = cat.addSet({ name: setName, active: true });
			report.setsCreated += 1;
		}
		for (const c of changes) {
			if (opts.budgetMs !== undefined && Date.now() - t0 > opts.budgetMs) {
				throw new JsxError("BUDGET_EXCEEDED", `tokens budget of ${opts.budgetMs} ms exceeded; send a smaller batch`);
			}
			const value = toPenpotValue(c.type, c.value);
			const existing = set.tokens.find((t) => t.name === c.name);
			if (existing && c.action === "update") existing.value = value;
			else if (!existing) set.addToken({ type: c.type, name: c.name, value });
		}
	}
	return report;
}
