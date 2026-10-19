// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/runtime.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot. The plugin runtime (design §3): one object with a version and an op table, kept in
// the MCP handler's `storage`. Ops run one at a time (promise mutex), each inside the flag bracket,
// and `op()` never throws: it returns `{ok, value, ms}` or `{ok: false, error}`.
// No Nova Terra constants: the namespace, guards, default page and budgets are arguments with
// neutral defaults.

import { JsxError } from "../errors";
import type { JsxErrorCode } from "../errors";
import type { EvalScope } from "../registry";
import { evaluate } from "./eval";
import type { EvaluateResult } from "./eval";
import { read } from "./read";
import type { ReadPenpot } from "./read";
import type { ReadQuery } from "./read-core";
import { render } from "./render";
import type { LivePenpot } from "./render";
import type { RScreen, RenderCfg, RenderOpts } from "./render-core";
import { snapshot } from "./snapshot";
import type { SnapPenpot, SnapshotOpts } from "./snapshot";
import { tokens } from "./tokens";
import type { TokensPenpot } from "./tokens";
import type { DesiredToken } from "../tokens/model";

export type OpName = "ping" | "snapshot" | "evaluate" | "render" | "read" | "tokens";

export const OP_NAMES: readonly OpName[] = ["ping", "snapshot", "evaluate", "render", "read", "tokens"];

export interface RuntimePenpot {
	readonly version: string;
	readonly currentFile: { readonly name: string } | null;
	flags?: { naturalChildOrdering?: boolean; throwValidationErrors?: boolean };
}

/** Defaults baked at install time; per-call args win (guards are the union). */
export interface RuntimeDeps {
	version: string;
	ns?: string;
	guards?: readonly string[];
	defaultPage?: string;
	budgetMs?: Partial<Record<"snapshot" | "render" | "read" | "tokens", number>>;
}

export interface OpError {
	code: JsxErrorCode;
	message: string;
	line?: number;
	column?: number;
	path?: string;
	hint?: string;
	valid?: string[];
}

export type OpResult<T = unknown> = { ok: true; value: T; ms: number } | { ok: false; error: OpError };

export interface OpArgs {
	ping: undefined;
	snapshot: SnapshotOpts | undefined;
	evaluate: { code: string; scope: EvalScope; filename?: string };
	render: { screen: RScreen; opts?: RenderOpts } & Partial<RenderCfg>;
	read: { query: ReadQuery; ns?: string; budgetMs?: number };
	tokens: { desired: DesiredToken[]; dryRun?: boolean; budgetMs?: number };
}

export interface Runtime {
	readonly version: string;
	op(name: string, args?: unknown): Promise<OpResult>;
}

const DEFAULT_NS = "penpot-jsx";
const DEFAULT_PAGE = "JSX Drafts";
const DEFAULT_BUDGET = { snapshot: 30_000, render: 80_000, read: 30_000, tokens: 60_000 } as const;

function invalid(message: string): JsxError {
	return new JsxError("INVALID_ARGS", message);
}

function obj(args: unknown, op: string): Record<string, unknown> {
	if (typeof args !== "object" || args === null || Array.isArray(args)) throw invalid(`${op}: args must be an object`);
	return args as Record<string, unknown>;
}

function serialize(e: unknown): OpError {
	if (e instanceof JsxError) return e.toJSON();
	return { code: "PLUGIN_ERROR", message: e instanceof Error ? e.message : String(e) };
}

export function createRuntime(penpot: RuntimePenpot, deps: RuntimeDeps): Runtime {
	const P = penpot as unknown as LivePenpot & ReadPenpot & SnapPenpot & TokensPenpot;
	const budget = (key: keyof typeof DEFAULT_BUDGET, given: unknown): number =>
		typeof given === "number" && given > 0 ? given : (deps.budgetMs?.[key] ?? DEFAULT_BUDGET[key]);

	/** Same bracket as the MCP handler's, so ops are idempotent with it; restored in `finally`. */
	async function withFlags<T>(fn: () => Promise<T> | T): Promise<T> {
		const f = penpot.flags;
		if (!f) return fn();
		const prev = { n: f.naturalChildOrdering, t: f.throwValidationErrors };
		f.naturalChildOrdering = true;
		f.throwValidationErrors = true;
		try {
			return await fn();
		} finally {
			f.naturalChildOrdering = prev.n;
			f.throwValidationErrors = prev.t;
		}
	}

	const table: Record<OpName, (args: unknown) => Promise<unknown> | unknown> = {
		ping: () => ({ version: deps.version, penpotVersion: penpot.version, file: penpot.currentFile?.name ?? null }),
		snapshot: (args) => {
			const a = args === undefined || args === null ? {} : (obj(args, "snapshot") as SnapshotOpts);
			return snapshot(P, { ...a, budgetMs: budget("snapshot", a.budgetMs) });
		},
		evaluate: (args) => {
			const a = obj(args, "evaluate");
			if (typeof a.code !== "string") throw invalid("evaluate: code must be a string");
			if (typeof a.scope !== "object" || a.scope === null) throw invalid("evaluate: scope is required");
			const sc = a.scope as Record<string, unknown>;
		const strs = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");
		if (!strs(sc.tags)) throw invalid("evaluate: scope.tags must be an array of strings");
		if (!strs(sc.importSpecifiers)) throw invalid("evaluate: scope.importSpecifiers must be an array of strings");
		const ns = sc.namespaces;
		if (typeof ns !== "object" || ns === null || Array.isArray(ns) || !Object.values(ns).every(strs)) {
			throw invalid("evaluate: scope.namespaces must map names to arrays of strings");
		}
		const input: Parameters<typeof evaluate>[0] = { code: a.code, scope: a.scope as EvalScope };
			if (typeof a.filename === "string") input.filename = a.filename;
			const out: EvaluateResult = evaluate(input);
			return out;
		},
		render: (args) => {
			const a = obj(args, "render") as unknown as OpArgs["render"];
			if (typeof a.screen !== "object" || a.screen === null) throw invalid("render: screen is required");
			const cfg: RenderCfg = {
				ns: a.ns ?? deps.ns ?? DEFAULT_NS,
				// A call can only add guards, never remove the baked ones.
				guards: [...new Set([...(deps.guards ?? []), ...(Array.isArray(a.guards) ? a.guards.filter((g): g is string => typeof g === "string") : [])])],
				defaultPage: a.defaultPage ?? deps.defaultPage ?? DEFAULT_PAGE,
				budgetMs: budget("render", a.budgetMs),
			};
			return render(P, a.screen, a.opts ?? { page: "" }, cfg);
		},
		read: (args) => {
			const a = obj(args, "read") as unknown as OpArgs["read"];
			if (typeof a.query !== "object" || a.query === null) throw invalid("read: query is required");
			return read(P, a.query, a.ns ?? deps.ns ?? DEFAULT_NS, { budgetMs: budget("read", a.budgetMs) });
		},
		tokens: (args) => {
			const a = obj(args, "tokens") as unknown as OpArgs["tokens"];
			if (!Array.isArray(a.desired)) throw invalid("tokens: desired must be an array");
			return tokens(P, a.desired, { dryRun: a.dryRun === true, budgetMs: budget("tokens", a.budgetMs) });
		},
	};

	async function exec(name: string, args: unknown): Promise<OpResult> {
		const t0 = Date.now();
		try {
			if (!(OP_NAMES as readonly string[]).includes(name)) {
				throw invalid(`unknown op "${name}"; valid: ${OP_NAMES.join(", ")}`);
			}
			const value = await withFlags(() => table[name as OpName](args));
			return { ok: true, value, ms: Date.now() - t0 };
		} catch (e) {
			return { ok: false, error: serialize(e) };
		}
	}

	// Ops chain onto one promise: two ops started together run in order, and an op that outlived its
	// caller's timeout still finishes before the next one starts.
	let tail: Promise<unknown> = Promise.resolve();
	return {
		version: deps.version,
		op(name, args) {
			const run = tail.then(() => exec(name, args));
			tail = run;
			return run;
		},
	};
}
