// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/eval.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Runs INSIDE Penpot (bundled to an IIFE) and under any JS host in tests. Evaluates transpiled
// CommonJS (design §4) against a mini JSX runtime and returns the JSON element tree the server
// replays. No registry, no zod, no sucrase: tags are opaque markers, so every unknown name is
// validated on the server, which has the registry and gives better messages.

import { JsxError } from "../errors";
import { PRIMITIVE_TAGS } from "../jsx/elements";
import type { Element } from "../jsx/elements";
import type { EvalScope } from "../registry";

export const MAX_ELEMENTS = 5000;
export const MAX_DEPTH = 64;

export interface EvaluateArgs {
	/** Transpiled CommonJS (`transpile()` output). */
	code: string;
	scope: EvalScope;
	filename?: string;
}

export interface EvaluateResult {
	screens: Element[];
	warnings: string[];
}

interface Marker {
	readonly __marker: string;
}

const isMarker = (v: unknown): v is Marker =>
	typeof v === "object" && v !== null && typeof (v as { __marker?: unknown }).__marker === "string";

const marker = (name: string): Marker => Object.freeze({ __marker: name });

/** Elements built by `element()`; a plain object with a `$` field is not one (caps would be bypassed). */
const made = new WeakSet<object>();

function flat(children: unknown, out: unknown[] = [], dropped?: Set<string>): unknown[] {
	if (children === undefined || children === null || typeof children === "boolean") return out;
	if (typeof children === "function" || typeof children === "symbol") {
		dropped?.add(typeof children === "function" ? "functions" : "symbols");
		return out;
	}
	if (Array.isArray(children)) for (const c of children) flat(c, out, dropped);
	else out.push(children);
	return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stackLine(err: unknown, file: string): number | undefined {
	const stack = err instanceof Error ? err.stack : undefined;
	if (!stack) return undefined;
	const m = new RegExp(`penpot-jsx/${escapeRe(file)}:(\\d+)`).exec(stack);
	return m ? Number(m[1]) : undefined;
}

let lineOffset: number | null | undefined;

/** Header lines the host prepends to `new Function` bodies, found once by throwing on line 1. */
function calibrate(): number | null {
	if (lineOffset !== undefined) return lineOffset;
	lineOffset = null;
	try {
		new Function("require", "exports", "module", 'throw new Error("calibrate");\n//# sourceURL=penpot-jsx/__calibrate__')();
	} catch (err) {
		const line = stackLine(err, "__calibrate__");
		if (line !== undefined) lineOffset = line - 1;
	}
	return lineOffset;
}

function errorLine(err: unknown, file: string): number | undefined {
	const raw = stackLine(err, file);
	const offset = calibrate();
	return raw !== undefined && offset !== null ? raw - offset : undefined;
}

/** 1-based line of the first `require("spec")` in the transpiled code (sucrase keeps line numbers). */
function requireLine(code: string, spec: string): number | undefined {
	const re = new RegExp(`require\\(\\s*(["'])${escapeRe(spec)}\\1\\s*\\)`);
	const lines = code.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) if (re.test(lines[i]!)) return i + 1;
	return undefined;
}

// Import-gating plus best-effort scope shadowing, NOT a security sandbox: the realm is Penpot's
// plugin sandbox and `execute_code` already has the same power. These names are `undefined` for user code.
const SHADOWED = ["globalThis", "penpot", "storage", "window", "self", "process"];

const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set([...SHADOWED, "require", "exports", "module", "arguments", "eval", "undefined", "default"]);

type Props = Record<string, unknown>;
type Src = { lineNumber?: number } | undefined;

interface Run {
	filename: string;
	warnings: string[];
	elements: number;
	depth: number;
}

function typeName(type: unknown): string {
	if (isMarker(type)) return type.__marker;
	if (typeof type === "function") return (type as { name?: string }).name || "Component";
	return String(type);
}

function cleanProps(run: Run, type: unknown, props: Props): Props {
	const out: Props = {};
	for (const [k, v] of Object.entries(props)) {
		if (k === "children") continue;
		const t = typeof v;
		if (t === "function" || t === "symbol" || v === undefined) {
			const why = t === "function" ? "functions" : t === "symbol" ? "symbols" : "undefined values";
			run.warnings.push(`<${typeName(type)} ${k}> dropped: ${why} are not serializable`);
			continue;
		}
		out[k] = v;
	}
	return out;
}

function makeRuntime(run: Run) {
	const element = (type: unknown, props: Props | null, src: Src): unknown => {
		const p = props ?? {};
		const line = src?.lineNumber;
		if (typeof type === "function") {
			if (run.depth >= MAX_DEPTH) {
				throw new JsxError("JSX_EVAL", `component nesting is deeper than ${MAX_DEPTH}; check for a component that renders itself`, line === undefined ? {} : { line });
			}
			run.depth += 1;
			try {
				return (type as (p: Props) => unknown)(p);
			} finally {
				run.depth -= 1;
			}
		}
		if (!isMarker(type)) {
			const where = line === undefined ? {} : { line };
			if (type === undefined || type === null) {
				throw new JsxError("JSX_UNKNOWN_COMPONENT", "the element type is undefined; check the tag name and its namespace", where);
			}
			throw new JsxError("JSX_INVALID_NODE", `<${String(type)}> is not supported; compose Screen, Stack, Row, Box, Text and library components`, where);
		}
		run.elements += 1;
		if (run.elements > MAX_ELEMENTS) {
			throw new JsxError("JSX_TOO_LARGE", `the source renders more than ${MAX_ELEMENTS} elements; split it into several files`, line === undefined ? {} : { line });
		}
		const dropped = new Set<string>();
		const el: Element = { $: type.__marker, p: cleanProps(run, type, p), c: flat(p.children, [], dropped) };
		for (const why of dropped) run.warnings.push(`<${type.__marker}> child dropped: ${why} are not serializable`);
		if (line !== undefined) el.l = line;
		made.add(el);
		return el;
	};
	const jsx = (type: unknown, props: Props | null, _key?: unknown, _isStatic?: unknown, src?: Src): unknown =>
		element(type, props, src);
	const Fragment = (p: { children?: unknown }): unknown[] => {
		const dropped = new Set<string>();
		const out = flat(p.children, [], dropped);
		for (const why of dropped) run.warnings.push(`<Fragment> child dropped: ${why} are not serializable`);
		return out;
	};
	return Object.freeze({ jsx, jsxs: jsx, jsxDEV: jsx, Fragment });
}

function makeTranslate(): (key: string, params?: Record<string, string | number>) => { key: string; params?: Record<string, string | number> } {
	return (key, params) => (params === undefined ? { key } : { key, params });
}

function makePackage(): unknown {
	const t = makeTranslate();
	const known: Record<string, unknown> = { __esModule: true, t };
	for (const tag of PRIMITIVE_TAGS) known[tag] = marker(tag);
	Object.freeze(known);
	const readOnly = (): never => {
		throw new JsxError("JSX_EVAL", "the @penpot/jsx package is read-only");
	};
	return new Proxy(known, {
		set: readOnly,
		defineProperty: readOnly,
		deleteProperty: readOnly,
		get(target, name) {
			if (typeof name === "symbol") return undefined;
			if (Object.hasOwn(target, name)) return target[name];
			return marker(name);
		},
	});
}

function makeRequire(scope: EvalScope, run: Run, code: string): (spec: string) => unknown {
	const allowed = new Set(scope.importSpecifiers);
	const runtime = makeRuntime(run);
	const pkg = makePackage();
	return (spec) => {
		if (!allowed.has(spec)) {
			const line = requireLine(code, spec);
			throw new JsxError("JSX_IMPORT", `import "${spec}" is not allowed; only ${scope.importSpecifiers.filter((s) => !s.includes("/jsx-")).join(", ")} can be imported`, {
				...(line === undefined ? {} : { line }),
				valid: scope.importSpecifiers,
			});
		}
		return spec.endsWith("/jsx-runtime") || spec.endsWith("/jsx-dev-runtime") ? runtime : pkg;
	};
}

function injected(scope: EvalScope): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const tag of scope.tags) if (IDENT.test(tag) && !RESERVED.has(tag)) out[tag] = marker(tag);
	for (const [root, members] of Object.entries(scope.namespaces)) {
		if (!IDENT.test(root) || RESERVED.has(root)) continue;
		out[root] = Object.freeze(Object.fromEntries(members.map((m) => [m, marker(`${root}.${m}`)])));
	}
	return out;
}

function toJsxError(err: unknown, filename: string): JsxError {
	if (err instanceof JsxError) {
		if (err.line === undefined) {
			const line = errorLine(err, filename);
			if (line !== undefined) err.line = line;
		}
		return err;
	}
	const message = err instanceof Error ? err.message : String(err);
	const line = errorLine(err, filename);
	const where = line === undefined ? {} : { line };
	if (err instanceof ReferenceError) {
		const m = /^(.+?) is not defined/.exec(message);
		return new JsxError("JSX_UNKNOWN_COMPONENT", m ? `${m[1]} is not defined; import it or use a component tag of this file` : message, where);
	}
	return new JsxError("JSX_EVAL", message, where);
}

function screensOf(value: unknown, filename: string): Element[] {
	const list = flat(value);
	const bad = (why: string): JsxError => new JsxError("JSX_NO_SCREENS", `${filename}: ${why}`, { hint: "export default a <Screen> or an array of <Screen>" });
	if (list.length === 0) throw bad("the default export renders no screens");
	for (const item of list) {
		if (typeof item === "object" && item !== null && !made.has(item)) {
			throw bad("the default export contains nodes not produced by JSX; return JSX elements only");
		}
		const tag = typeof item === "object" && item !== null ? (item as { $?: unknown }).$ : undefined;
		if (tag !== "Screen") {
			throw bad(`the default export must be a Screen or an array of Screens, found ${tag === undefined ? typeof item : `<${String(tag)}>`}`);
		}
	}
	return list as Element[];
}

/** Evaluates transpiled code and returns the screens as a JSON element tree plus warnings. */
export function evaluate(args: EvaluateArgs): EvaluateResult {
	const filename = args.filename ?? "source.tsx";
	const run: Run = { filename, warnings: [], elements: 0, depth: 0 };
	const mod: { exports: { default?: unknown } } = { exports: {} };
	const scope = injected(args.scope);
	let value: unknown;
	try {
		const fn = new Function("require", "exports", "module", ...SHADOWED, ...Object.keys(scope), `${args.code}\n//# sourceURL=penpot-jsx/${filename}`);
		fn(makeRequire(args.scope, run, args.code), mod.exports, mod, ...SHADOWED.map(() => undefined), ...Object.values(scope));
		value = mod.exports.default;
		if (typeof value === "function") {
			run.depth += 1;
			try {
				value = (value as () => unknown)();
			} finally {
				run.depth -= 1;
			}
		}
	} catch (err) {
		throw toJsxError(err, filename);
	}
	const screens = screensOf(value, filename);
	try {
		const safe = JSON.parse(JSON.stringify(screens)) as Element[];
		return { screens: safe, warnings: [...new Set(run.warnings)] };
	} catch (err) {
		throw new JsxError("JSX_EVAL", `the screens are not JSON-serializable: ${err instanceof Error ? err.message : String(err)}`);
	}
}
