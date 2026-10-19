// GENERATED from nova-terra tools/design-bridge/src/engine/emit/jsx.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// IR -> design-JSX source (design R8.2). Deterministic: pragma first, sorted imports,
// props sorted with `id` first, classes via toClasses (R4.3), 2-space indent, t("key") for
// keyed text. Nothing here may produce a file that fails to evaluate: what the DSL cannot
// express (unknown component, layoutChild on a component, ...) becomes a placeholder or a
// dropped prop plus a warning.

import { isAutoId, normalize } from "../ir/normalize";
import type { Chrome, Dim, Layout, LayoutChild, Node, Platform, ScreenNode, TextValue } from "../ir/schema";
import { camelCase } from "../naming";
import { BASE_IMPORT, expandChrome } from "../registry";
import type { ChromePart, Registry, RegistryComponent } from "../registry";
import { toClasses } from "../tailwind";
import type { Theme } from "../theme";

export interface EmitResult {
	source: string;
	warnings: string[];
}

export interface EmitCtx {
	registry: Registry;
	theme: Theme;
	/** Module the source imports from (default `@penpot/jsx`); also the `@jsxImportSource` pragma. */
	importFrom?: string;
}

const INDENT = "  ";

interface Ctx {
	reg: Registry;
	/** Spacing scale as [key, px], in theme order. */
	spacing: [string, number][];
	platform: Platform;
	screenId: string;
	imports: Set<string>;
	warnings: string[];
}

const SAFE_ATTR = /^[^"\\&<>{}\n\r]*$/;
const SAFE_TEXT = /^[\p{L}\p{N}][\p{L}\p{N} .,:;!?'()\u00b7\u2013-]*$/u;
const IDENT = /^[A-Za-z_$][\w$]*$/;

function attr(name: string, value: string): string {
	return SAFE_ATTR.test(value) ? `${name}="${value}"` : `${name}={${JSON.stringify(value)}}`;
}

function paramsSource(params: Record<string, string | number>): string {
	const body = Object.keys(params)
		.sort()
		.map((k) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(params[k])}`)
		.join(", ");
	return `{ ${body} }`;
}

function tCall(v: { key: string; params?: Record<string, string | number> }): string {
	return v.params === undefined || Object.keys(v.params).length === 0
		? `t(${JSON.stringify(v.key)})`
		: `t(${JSON.stringify(v.key)}, ${paramsSource(v.params)})`;
}

function textValueSource(v: TextValue, ctx: Ctx): string {
	if ("key" in v) {
		ctx.imports.add("t");
		return tCall(v);
	}
	return JSON.stringify(v.literal);
}

function slotProp(name: string, v: TextValue, ctx: Ctx): string {
	if ("key" in v) {
		ctx.imports.add("t");
		return `${name}={${tCall(v)}}`;
	}
	return attr(name, v.literal);
}

function idProp(node: { id?: string }): string[] {
	return node.id !== undefined && !isAutoId(node.id) ? [attr("id", node.id)] : [];
}

function comment(text: string): string {
	return `{/* design-bridge: ${text.replace(/\*\//g, "* /")} */}`;
}

function lines(depth: number, text: string): string {
	return `${INDENT.repeat(depth)}${text}`;
}

/** The forward map reads a px equal to a spacing token as that token, so emit the token (canonical form). */
function canonDim(d: Dim, scale: readonly [string, number][]): Dim {
	if ("token" in d) return d;
	const hit = scale.find(([, px]) => px === d.px);
	return hit ? { token: hit[0] } : d;
}

/** Layout without `dir`: the element (Stack, Row, Box) carries the direction. */
function layoutClasses(node: Layout, scale: readonly [string, number][]): Partial<Layout> {
	const { dir: _dir, gap, padding, ...rest } = node;
	void _dir;
	const out: Partial<Layout> = { ...rest };
	if (gap) out.gap = canonDim(gap, scale);
	if (padding) out.padding = padding.map((d) => canonDim(d, scale)) as [Dim, Dim, Dim, Dim];
	return out;
}

function classProp(classes: string): string[] {
	return classes === "" ? [] : [attr("className", classes)];
}

function checkSizing(lc: LayoutChild | undefined, where: string, ctx: Ctx): void {
	if (!lc) return;
	if (lc.h === "auto" || lc.v === "auto" || (lc.h === "fix" && lc.width === undefined) || (lc.v === "fix" && lc.height === undefined)) {
		ctx.warnings.push(`${where}: sizing ${JSON.stringify(lc)} has no Tailwind class; dropped`);
	}
}

function openTag(name: string, props: string[], depth: number, selfClose: boolean): string[] {
	const sorted = props;
	const one = `<${name}${sorted.length > 0 ? ` ${sorted.join(" ")}` : ""}${selfClose ? " />" : ">"}`;
	if (one.length + depth * INDENT.length <= 100 || sorted.length <= 1) return [lines(depth, one)];
	return [
		lines(depth, `<${name}`),
		...sorted.map((p) => lines(depth + 1, p)),
		lines(depth, selfClose ? "/>" : ">"),
	];
}

function sortProps(props: string[]): string[] {
	const name = (p: string): string => p.slice(0, p.search(/[=\s]|$/));
	return [...props].sort((a, b) => {
		const an = name(a);
		const bn = name(b);
		if (an === "id") return bn === "id" ? 0 : -1;
		if (bn === "id") return 1;
		return an < bn ? -1 : an > bn ? 1 : 0;
	});
}

function emitFrame(
	node: Extract<Node, { kind: "frame" }>,
	depth: number,
	ctx: Ctx,
	path: string,
	parentDir: Layout["dir"],
): string[] {
	const out: string[] = [];
	if (node.unsupported !== undefined) out.push(lines(depth, comment(`unsupported ${node.unsupported}`)));
	const tagName = node.layout.dir === "column" ? "Stack" : node.layout.dir === "row" ? "Row" : "Box";
	ctx.imports.add(tagName);
	checkSizing(node.layoutChild, node.id ?? path, ctx);
	const classes = toClasses(layoutClasses(node.layout, ctx.spacing), node.style, node.layoutChild, { parentDir });
	const props = sortProps([
		...idProp(node),
		...(node.name !== undefined ? [attr("name", node.name)] : []),
		...classProp(classes),
	]);
	if (node.children.length === 0) {
		out.push(...openTag(tagName, props, depth, true));
		return out;
	}
	out.push(...openTag(tagName, props, depth, false));
	out.push(...emitChildren(node.children, depth + 1, ctx, path, node.layout.dir));
	out.push(lines(depth, `</${tagName}>`));
	return out;
}

function emitText(
	node: Extract<Node, { kind: "text" }>,
	depth: number,
	ctx: Ctx,
	path: string,
	parentDir: Layout["dir"],
): string[] {
	ctx.imports.add("Text");
	checkSizing(node.layoutChild, node.id ?? path, ctx);
	const classes = toClasses({}, node.style, node.layoutChild, { text: true, parentDir });
	const props = sortProps([...idProp(node), ...classProp(classes)]);
	let child: string;
	if ("key" in node.value) child = `{${textValueSource(node.value, ctx)}}`;
	else child = SAFE_TEXT.test(node.value.literal) && node.value.literal === node.value.literal.trimEnd() ? node.value.literal : `{${JSON.stringify(node.value.literal)}}`;
	const open = openTag("Text", props, depth, false);
	if (open.length === 1) return [`${open[0]}${child}</Text>`];
	return [...open, lines(depth + 1, child), lines(depth, "</Text>")];
}

function componentOf(reg: Registry, set: string): RegistryComponent | undefined {
	return Object.values(reg.components).find((c) => c.set === set);
}

/** The name a tag is imported by: the namespace root of a dotted tag. */
function importName(tag: string): string {
	return tag.split(".")[0]!;
}

/** A component node as DSL, or undefined when the registry cannot express it. */
function componentSource(
	node: Extract<Node, { kind: "component" }>,
	depth: number,
	ctx: Ctx,
	path: string,
	parentDir: Layout["dir"],
): string[] | undefined {
	const comp = componentOf(ctx.reg, node.set);
	if (!comp) return undefined;
	const props: string[] = [...idProp(node)];
	for (const prop of comp.group.properties) {
		const value = node.variant[prop];
		if (value === undefined) {
			ctx.warnings.push(`${node.set}: variant has no "${prop}"; placeholder`);
			return undefined;
		}
		if (!(comp.group.values[prop] ?? []).includes(value)) {
			ctx.warnings.push(`${node.set}: "${prop}" = "${value}" is not a library value; placeholder`);
			return undefined;
		}
		if (!(comp.authoritative && comp.defaults[prop] === value)) props.push(attr(camelCase(prop), value));
	}
	const aliasOf = new Map(Object.entries(comp.slots).map(([alias, layer]) => [layer, alias]));
	for (const [layer, v] of Object.entries(node.slots)) {
		const alias = aliasOf.get(layer);
		if (alias === undefined) {
			ctx.warnings.push(`${node.set}: text layer "${layer}" is not a DSL slot; dropped`);
			continue;
		}
		props.push(slotProp(alias, v, ctx));
	}
	checkSizing(node.layoutChild, node.id ?? path, ctx);
	props.push(...classProp(toClasses({}, {}, node.layoutChild, { parentDir })));
	ctx.imports.add(importName(comp.tag));
	return openTag(comp.tag, sortProps(props), depth, true);
}

function emitComponent(
	node: Extract<Node, { kind: "component" }>,
	depth: number,
	ctx: Ctx,
	path: string,
	parentDir: Layout["dir"],
): string[] {
	const dsl = componentSource(node, depth, ctx, path, parentDir);
	if (dsl) return dsl;
	if (componentOf(ctx.reg, node.set) === undefined) {
		ctx.warnings.push(`${node.set}: not a DSL component (chrome that could not be folded, or an unknown set); placeholder`);
	}
	ctx.imports.add("Box");
	const props = sortProps([...idProp(node), attr("name", node.set.replace(/\//g, " \u00b7 "))]);
	return [
		lines(depth, comment(`unsupported component ${node.set} ${JSON.stringify(node.variant)}`)),
		...openTag("Box", props, depth, true),
	];
}

function emitChildren(children: Node[], depth: number, ctx: Ctx, path: string, parentDir: Layout["dir"]): string[] {
	return children.flatMap((c, i) => emitNode(c, depth, ctx, `${path}/${i}`, parentDir));
}

function emitNode(node: Node, depth: number, ctx: Ctx, path: string, parentDir: Layout["dir"]): string[] {
	switch (node.kind) {
		case "frame":
			return emitFrame(node, depth, ctx, path, parentDir);
		case "text":
			return emitText(node, depth, ctx, path, parentDir);
		case "component":
			return emitComponent(node, depth, ctx, path, parentDir);
		case "screen":
			throw new Error("design-bridge: screens cannot be nested");
	}
}

const TOP: ChromePart[] = ["statusBar", "navBar"];
const BOTTOM: ChromePart[] = ["tabBar", "gesture"];

/**
 * Chrome components are expanded from `Screen.chrome` flags (R2.5), so the inverse folds a
 * leading top run and a trailing bottom run back into flags. A run is folded only when
 * re-expanding the flags reproduces it exactly; anything else stays as components.
 */
function foldChrome(screen: ScreenNode, reg: Registry): { chrome?: Chrome; children: Node[] } {
	const kids = screen.children;
	const partOf = (n: Node | undefined): ChromePart | undefined => {
		if (n === undefined || n.kind !== "component") return undefined;
		return reg.chrome.find((x) => x.set === n.set && x.platform === screen.platform)?.part;
	};
	let head = 0;
	while (head < kids.length && TOP.includes(partOf(kids[head]) as ChromePart)) head++;
	let tail = kids.length;
	while (tail > head && BOTTOM.includes(partOf(kids[tail - 1]) as ChromePart)) tail--;
	const run = [...kids.slice(0, head), ...kids.slice(tail)];
	if (run.length === 0) return { children: kids };
	const flags: Chrome = {};
	for (const n of run) flags[partOf(n) as ChromePart] = true;
	try {
		const re = expandChrome(reg, screen.platform, flags);
		const canon = (nodes: Node[]): string => JSON.stringify(nodes.map((n) => normalize(n)));
		if (canon([...re.top, ...re.bottom]) === canon(run)) return { chrome: flags, children: kids.slice(head, tail) };
	} catch {
		// a part that does not exist for this platform: leave the components as they are
	}
	return { children: kids };
}

function chromeSource(flags: Chrome): string {
	const parts = (["statusBar", "navBar", "tabBar", "gesture"] as const).filter((p) => flags[p]);
	return `chrome={{ ${parts.map((p) => `${p}: true`).join(", ")} }}`;
}

function emitScreen(screen: ScreenNode, depth: number, imports: Set<string>, warnings: string[], reg: Registry, scale: [string, number][]): string[] {
	const ctx: Ctx = { reg, spacing: scale, platform: screen.platform, screenId: screen.id, imports, warnings };
	imports.add("Screen");
	const folded = foldChrome(screen, reg);
	const classes = toClasses(layoutClasses(screen.layout, scale));
	const props = sortProps([
		attr("id", screen.id),
		attr("platform", screen.platform),
		attr("title", screen.title),
		...(folded.chrome ? [chromeSource(folded.chrome)] : []),
		...classProp(classes),
	]);
	const out: string[] = [];
	if (folded.children.length === 0) {
		out.push(...openTag("Screen", props, depth, true));
		return out;
	}
	out.push(...openTag("Screen", props, depth, false));
	out.push(...folded.children.flatMap((c, i) => emitNode(c, depth + 1, ctx, `${screen.id}/${i}`, "column")));
	out.push(lines(depth, "</Screen>"));
	return out;
}

/** One `.tsx` source for one or more screens (default export: a screen, or an array of them). */
export function emitJsx(screens: readonly ScreenNode[], emit: EmitCtx): EmitResult {
	if (screens.length === 0) throw new Error("design-bridge: nothing to emit");
	const importFrom = emit.importFrom ?? BASE_IMPORT;
	const scale = Object.entries(emit.theme.spacing).map(([k, v]): [string, number] => [k, v.value]);
	const reg = emit.registry;
	const imports = new Set<string>();
	const warnings: string[] = [];
	const body: string[] = [];
	if (screens.length === 1) {
		body.push("export default (", ...emitScreen(screens[0] as ScreenNode, 1, imports, warnings, reg, scale), ");");
	} else {
		body.push("export default [");
		for (const s of screens) {
			body.push(lines(1, "("), ...emitScreen(s, 2, imports, warnings, reg, scale), lines(1, "),"));
		}
		body.push("];");
	}
	const names = [...imports].sort();
	const source = [`/** @jsxImportSource ${importFrom} */`, `import { ${names.join(", ")} } from "${importFrom}";`, "", ...body, ""].join("\n");
	return { source, warnings: [...new Set(warnings)] };
}
