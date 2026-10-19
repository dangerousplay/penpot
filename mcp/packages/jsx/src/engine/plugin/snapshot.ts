// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/snapshot.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot (bundled to an IIFE). The live library snapshot (design §5): a light pass over
// the local and connected libraries, an opt-in detail pass for named sets, the token catalog and the
// preset boards of the current page. Returns plain JSON-serialisable data shaped like `LiveSnapshot`.
// `penpot` is an argument; no Nova Terra constants live here.

import { JsxError } from "../errors";
import type { LiveSet, LiveSnapshot, LiveVariant, TokenCatalog } from "../snapshot";

/** Hard cap on components walked across all libraries (design §5). */
export const MAX_SNAPSHOT_COMPONENTS = 2000;

export interface SnapShape {
	readonly id: string;
	readonly type: string;
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly children?: SnapShape[];
}

export interface SnapVariants {
	readonly id: string;
	readonly name?: string;
	readonly properties: string[];
	currentValues(property: string): string[];
	variantComponents(): SnapComponent[];
}

export interface SnapComponent {
	readonly id: string;
	readonly name: string;
	readonly path?: string;
	readonly variants?: SnapVariants | null;
	readonly variantProps?: { [property: string]: string };
	isVariant(): boolean;
	mainInstance(): SnapShape;
}

export interface SnapLibrary {
	readonly id?: string;
	readonly name?: string;
	readonly components: SnapComponent[];
}

interface SnapToken {
	readonly name: string;
	readonly type: string;
	readonly value: unknown;
	readonly resolvedValue?: unknown;
}

interface SnapTokenSet {
	readonly name: string;
	readonly active: boolean;
	readonly tokens: SnapToken[];
}

export interface SnapPenpot {
	readonly version: string;
	readonly currentFile: {
		readonly id?: string;
		readonly name: string;
		readonly pages: ReadonlyArray<{ readonly id: string; readonly name: string }>;
	} | null;
	readonly currentPage: { readonly name: string; readonly root: SnapShape } | null;
	readonly library: {
		readonly local: SnapLibrary & {
			readonly tokens: {
				readonly sets: SnapTokenSet[];
				readonly themes: {
					readonly group: string;
					readonly name: string;
					readonly active: boolean;
					readonly activeSets: { readonly name: string }[];
				}[];
			};
		};
		/** Connected shared libraries; present from Penpot 2.18. */
		readonly connected?: SnapLibrary[];
	};
}

export interface SnapshotOpts {
	/** Sets (by name) that get per-variant detail; `"all"` for every set. */
	detailSets?: string[] | "all";
	/** Include the token catalog (default true). */
	tokens?: boolean;
	/** `"local"` skips connected libraries (default `"all"`). */
	libraries?: "local" | "all";
	/** Wall-clock budget; checked between components in the detail pass. */
	budgetMs?: number;
}

/** `path/to/Set` + `Name` -> `path · to · Set · Name`; the shared naming of sets across the engine. */
export function setNameOf(path: string | undefined, name: string): string {
	const segs = (path ?? "")
		.split("/")
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
	return segs.length > 0 ? `${segs.join(" · ")} · ${name.trim()}` : name.trim();
}

/** Text layers in tree order; a repeated name appears once per layer. */
export function textSlotsOf(root: SnapShape): string[] {
	const out: string[] = [];
	const stack: SnapShape[] = [...(root.children ?? [])].reverse();
	while (stack.length > 0) {
		const s = stack.pop() as SnapShape;
		if (s.type === "text") out.push(s.name);
		if (s.children) stack.push(...[...s.children].reverse());
	}
	return out;
}

interface Pass {
	count: number;
	t0: number;
	budgetMs?: number;
	detail: (set: string) => boolean;
}

function tick(pass: Pass, n: number): void {
	pass.count += n;
	if (pass.count > MAX_SNAPSHOT_COMPONENTS) {
		throw new JsxError("SNAPSHOT_TOO_LARGE", `the open file has more than ${MAX_SNAPSHOT_COMPONENTS} components`, {
			hint: 'pass a filter, or libraries: "local" to skip connected libraries',
		});
	}
}

function checkBudget(pass: Pass): void {
	if (pass.budgetMs !== undefined && Date.now() - pass.t0 > pass.budgetMs) {
		throw new JsxError("BUDGET_EXCEEDED", `snapshot budget of ${pass.budgetMs} ms exceeded`, {
			hint: "request detail for fewer sets",
		});
	}
}

function variantOf(c: SnapComponent, withDetail: boolean, pass: Pass): LiveVariant {
	const out: LiveVariant = { componentId: c.id, variantProps: { ...(c.variantProps ?? {}) } };
	if (!withDetail) return out;
	checkBudget(pass);
	const main = c.mainInstance();
	out.mainInstanceId = main.id;
	out.width = main.width;
	out.height = main.height;
	out.textSlots = textSlotsOf(main);
	return out;
}

function collectSets(lib: SnapLibrary, local: boolean, pass: Pass): LiveSet[] {
	const seen = new Set<string>();
	const sets: LiveSet[] = [];
	const label = (set: LiveSet): LiveSet => {
		if (lib.id !== undefined) set.libraryId = lib.id;
		if (!local && lib.name !== undefined) set.library = lib.name;
		return set;
	};
	for (const comp of lib.components) {
		const variants = comp.isVariant() ? (comp.variants ?? null) : null;
		if (!variants) {
			tick(pass, 1);
			const set = setNameOf(comp.path, comp.name);
			sets.push(
				label({
					set,
					variantsId: null,
					properties: [],
					values: {},
					variants: [variantOf(comp, pass.detail(set), pass)],
				}),
			);
			continue;
		}
		if (seen.has(variants.id)) continue;
		seen.add(variants.id);
		const set = setNameOf(comp.path, variants.name ?? comp.name);
		const properties = [...variants.properties];
		const members = variants.variantComponents();
		tick(pass, members.length);
		const withDetail = pass.detail(set);
		sets.push(
			label({
				set,
				variantsId: variants.id,
				properties,
				values: Object.fromEntries(properties.map((p) => [p, [...variants.currentValues(p)]])),
				variants: members.map((m) => variantOf(m, withDetail, pass)),
			}),
		);
	}
	return sets;
}

function clone(v: unknown): unknown {
	return JSON.parse(JSON.stringify(v ?? null)) as unknown;
}

export function collectTokens(P: SnapPenpot): TokenCatalog {
	const cat = P.library.local.tokens;
	return {
		sets: cat.sets.map((s) => ({
			name: s.name,
			active: s.active,
			tokens: s.tokens.map((t) => {
				const out: TokenCatalog["sets"][number]["tokens"][number] = {
					name: t.name,
					type: t.type,
					value: clone(t.value),
				};
				if (t.resolvedValue !== undefined && t.resolvedValue !== null) out.resolvedValue = clone(t.resolvedValue);
				return out;
			}),
		})),
		themes: cat.themes.map((t) => ({
			group: t.group,
			name: t.name,
			active: t.active,
			activeSets: t.activeSets.map((s) => s.name),
		})),
	};
}

/** Top-level boards of the current page: the platform size presets come from these. */
export function collectPresets(P: SnapPenpot): { name: string; width: number; height: number }[] {
	return (P.currentPage?.root.children ?? [])
		.filter((s) => s.type === "board")
		.map((s) => ({ name: s.name, width: s.width, height: s.height }));
}

export function snapshot(P: SnapPenpot, opts: SnapshotOpts = {}): LiveSnapshot {
	const detail = opts.detailSets;
	const wanted = Array.isArray(detail) ? new Set(detail) : undefined;
	const pass: Pass = {
		count: 0,
		t0: Date.now(),
		detail: (set) => detail === "all" || (wanted?.has(set) ?? false),
	};
	if (opts.budgetMs !== undefined) pass.budgetMs = opts.budgetMs;

	const sets = collectSets(P.library.local, true, pass);
	if (opts.libraries !== "local") {
		for (const lib of P.library.connected ?? []) sets.push(...collectSets(lib, false, pass));
	}

	const file = P.currentFile;
	const out: LiveSnapshot = {
		penpotVersion: P.version,
		file: file ? (file.id !== undefined ? { id: file.id, name: file.name } : { name: file.name }) : null,
		pages: (file?.pages ?? []).map((p) => ({ name: p.name, id: p.id })),
		sets,
		presets: collectPresets(P),
	};
	if (P.currentPage) out.currentPage = P.currentPage.name;
	if (opts.tokens !== false) out.tokens = collectTokens(P);
	return out;
}
