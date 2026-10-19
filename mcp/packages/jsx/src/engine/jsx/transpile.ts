// GENERATED from nova-terra tools/design-bridge/src/engine/jsx/transpile.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Transpile: sucrase, string in, CommonJS string out (design §4). The server only transpiles; the
// plugin sandbox evaluates. `production: false` makes the automatic runtime emit `jsxDEV` calls with
// source positions, so every element carries its line.

import { transform } from "sucrase";
import { JsxError } from "../errors";
import { BASE_IMPORT } from "../registry";

export interface TranspileOptions {
	filename?: string;
	/** Extra import roots (profile `importAliases`); each also allows `/jsx-runtime` and `/jsx-dev-runtime`. */
	importAliases?: readonly string[];
	/** The module the automatic JSX runtime is imported from. */
	jsxImportSource?: string;
}

function allowedSpecifiers(o: TranspileOptions): Set<string> {
	const roots = [BASE_IMPORT, ...(o.importAliases ?? [])];
	return new Set(roots.flatMap((r) => [r, `${r}/jsx-runtime`, `${r}/jsx-dev-runtime`]));
}

export function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 1-based line of the first `import ... from "spec"` / `import "spec"` in the source. */
export function findImportLine(source: string, spec: string): number | undefined {
	const re = new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*)(["'])${escapeRe(spec)}\\1`);
	const lines = source.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (re.test(lines[i]!)) return i + 1;
	}
	return undefined;
}

const REQUIRE = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;

/** Throws `JSX_SYNTAX` (with line and column) or `JSX_IMPORT`; returns the CommonJS code. */
export function transpile(source: string, o: TranspileOptions = {}): { code: string } {
	const filename = o.filename ?? "source.tsx";
	let code: string;
	try {
		code = transform(source, {
			transforms: ["jsx", "typescript", "imports"],
			jsxRuntime: "automatic",
			production: false,
			jsxImportSource: o.jsxImportSource ?? BASE_IMPORT,
			filePath: filename,
		}).code;
	} catch (err) {
		const loc = (err as { loc?: { line?: number; column?: number } }).loc;
		const raw = err instanceof Error ? err.message : String(err);
		throw new JsxError("JSX_SYNTAX", raw, { line: loc?.line, column: loc?.column });
	}
	// Type-only imports are already erased, so every remaining require() is a real import.
	const allowed = allowedSpecifiers(o);
	for (const m of code.matchAll(REQUIRE)) {
		const spec = m[2]!;
		if (allowed.has(spec)) continue;
		throw new JsxError("JSX_IMPORT", `import "${spec}" is not allowed; only ${[...allowed].filter((s) => !s.includes("/jsx-")).join(", ")} can be imported`, {
			line: findImportLine(source, spec),
			valid: [...allowed],
		});
	}
	return { code };
}
