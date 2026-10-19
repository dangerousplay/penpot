// GENERATED from nova-terra tools/design-bridge/src/engine/push/prepare.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Server side of push: IR screen -> render model. Resolves i18n text, maps class keys to Penpot
// token names through the theme, picks the exact variant componentId from the registry's sets and
// applies the platform preset size. The plugin then needs no messages, registry or name map.

import { JsxError } from "../errors";
import { resolveText } from "../i18n";
import type { CompiledMessages } from "../i18n";
import type { Dim, Layout, Node, ScreenNode, StyleRefs } from "../ir/schema";
import type { Registry } from "../registry";
import type { Theme } from "../theme";
import { matchVariant, safeName } from "./render-model";
import type { RDim, RLayout, RNode, RScreen, RStyle, RToken } from "./render-model";

export interface PrepareCtx {
	registry: Registry;
	theme: Theme;
	messages?: CompiledMessages;
	locale: string;
	/** A missing `t()` key throws instead of falling back to the key. */
	strict?: boolean;
	/** Collects warnings; the caller reads it after `prepareScreen`. */
	warnings: string[];
}

const PLATFORM_LABEL = { web: "Web", ios: "iOS", android: "Android" } as const;

function dim(d: Dim, theme: Theme): RDim {
	if ("px" in d) return { px: d.px };
	if (!Object.hasOwn(theme.spacing, d.token)) {
		throw new JsxError("JSX_INVALID_VALUE", `unknown spacing token "${d.token}". Valid: ${Object.keys(theme.spacing).join(", ")}`, {
			valid: Object.keys(theme.spacing),
		});
	}
	const s = theme.spacing[d.token]!;
	return { px: s.value, token: s.token };
}

function layout(l: Layout, theme: Theme): RLayout {
	const out: RLayout = { dir: l.dir };
	if (l.gap) out.gap = dim(l.gap, theme);
	if (l.padding) {
		out.padding = [dim(l.padding[0], theme), dim(l.padding[1], theme), dim(l.padding[2], theme), dim(l.padding[3], theme)];
	}
	if (l.align) out.align = l.align;
	if (l.justify) out.justify = l.justify;
	if (l.wrap) out.wrap = true;
	return out;
}

function colorToken(theme: Theme, key: string): RToken | undefined {
	if (!Object.hasOwn(theme.colors, key)) return undefined;
	const c = theme.colors[key]!;
	return c.value === undefined ? { name: c.token } : { name: c.token, raw: c.value };
}

function style(s: StyleRefs, where: string, ctx: PrepareCtx): RStyle {
	const out: RStyle = {};
	for (const slot of ["fill", "stroke"] as const) {
		const key = s[slot];
		if (key === undefined) continue;
		const tok = colorToken(ctx.theme, key);
		if (tok) out[slot] = tok;
		else ctx.warnings.push(`${where}: unknown color "${key}" for ${slot}; ignored`);
	}
	if (s.radius !== undefined) {
		if (Object.hasOwn(ctx.theme.radius, s.radius)) {
			const r = ctx.theme.radius[s.radius]!;
			out.radius = { name: r.token, raw: r.value };
		} else ctx.warnings.push(`${where}: unknown radius "${s.radius}"; ignored`);
	}
	if (s.shadow !== undefined) {
		if (Object.hasOwn(ctx.theme.shadow, s.shadow)) out.shadow = { name: ctx.theme.shadow[s.shadow]!.token };
		else ctx.warnings.push(`${where}: unknown shadow "${s.shadow}"; ignored`);
	}
	if (s.typography !== undefined) {
		ctx.warnings.push(`${where}: typography "${s.typography}" is not applied yet (no typography token map)`);
	}
	return out;
}

function text(value: Parameters<typeof resolveText>[0], ctx: PrepareCtx) {
	const o: Parameters<typeof resolveText>[1] = {
		locale: ctx.locale,
		warn: (m) => ctx.warnings.push(m),
	};
	if (ctx.messages) o.messages = ctx.messages;
	if (ctx.strict !== undefined) o.strict = ctx.strict;
	return resolveText(value, o);
}

function convert(node: Node, path: string, ctx: PrepareCtx): RNode {
	switch (node.kind) {
		case "screen":
			throw new JsxError("JSX_INVALID_NODE", "screens cannot be nested");
		case "frame": {
			const nodeId = node.id ?? path;
			const out: Extract<RNode, { kind: "frame" }> = {
				kind: "frame",
				nodeId,
				layout: layout(node.layout, ctx.theme),
				style: style(node.style, nodeId, ctx),
				children: node.children.map((c, i) => convert(c, `${path}/${i}`, ctx)),
			};
			if (node.name !== undefined) out.name = node.name;
			if (node.layoutChild) out.layoutChild = node.layoutChild;
			return out;
		}
		case "text": {
			const nodeId = node.id ?? path;
			const out: Extract<RNode, { kind: "text" }> = {
				kind: "text",
				nodeId,
				text: text(node.value, ctx),
				style: style(node.style, nodeId, ctx),
			};
			if (node.layoutChild) out.layoutChild = node.layoutChild;
			return out;
		}
		case "component": {
			const group = ctx.registry.sets.get(node.set);
			if (!group) throw new JsxError("JSX_UNKNOWN_COMPONENT", `component set "${node.set}" is not in the snapshot`);
			const hit = matchVariant(node.set, group.variants, node.variant);
			const out: Extract<RNode, { kind: "component" }> = {
				kind: "component",
				nodeId: node.id ?? path,
				set: node.set,
				componentId: hit.componentId,
				variant: node.variant,
				slots: Object.fromEntries(Object.entries(node.slots).map(([layer, v]) => [layer, text(v, ctx)])),
			};
			if (group.libraryId !== undefined) out.libraryId = group.libraryId;
			if (node.layoutChild) out.layoutChild = node.layoutChild;
			return out;
		}
	}
}

export function prepareScreen(screen: ScreenNode, ctx: PrepareCtx): RScreen {
	const size = ctx.registry.presets[screen.platform];
	if (!size) {
		throw new JsxError("JSX_INVALID_VALUE", `no preset size for platform "${screen.platform}" in the snapshot`, {
			hint: "add a board named \"<Web|iOS|Android> · ...\" to the current page, or set profile.presets",
		});
	}
	return {
		id: screen.id,
		platform: screen.platform,
		title: screen.title,
		name: safeName(`${PLATFORM_LABEL[screen.platform]} · ${screen.title}`),
		width: Math.round(size.width),
		height: Math.round(size.height),
		layout: layout(screen.layout, ctx.theme),
		children: screen.children.map((c, i) => convert(c, `${screen.id}/${i}`, ctx)),
	};
}
