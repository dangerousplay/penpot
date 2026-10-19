// GENERATED from nova-terra tools/design-bridge/src/engine/ir/schema.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
import { z } from "zod";

export type TextValue =
	| { key: string; params?: Record<string, string | number> }
	| { literal: string };

export type Dim = { token: string } | { px: number };

export type Layout = {
	dir: "column" | "row" | "none";
	gap?: Dim;
	padding?: [Dim, Dim, Dim, Dim];
	align?: "start" | "center" | "end" | "stretch";
	justify?: "start" | "center" | "end" | "between";
	wrap?: boolean;
};

export type StyleRefs = {
	fill?: string;
	stroke?: string;
	radius?: string;
	shadow?: string;
	typography?: string;
};

export type LayoutChild = {
	h?: "fix" | "fill" | "auto";
	v?: "fix" | "fill" | "auto";
	width?: number;
	height?: number;
};

export type Platform = "web" | "ios" | "android";

export type Chrome = {
	statusBar?: boolean;
	navBar?: boolean;
	tabBar?: boolean;
	gesture?: boolean;
};

/** `_classes` holds the raw Tailwind class string until T5 resolves it. */
export type Node =
	| {
			kind: "screen";
			id: string;
			platform: Platform;
			title: string;
			layout: Layout;
			children: Node[];
			_classes?: string;
	  }
	| {
			kind: "frame";
			id?: string;
			name?: string;
			layout: Layout;
			style: StyleRefs;
			children: Node[];
			layoutChild?: LayoutChild;
			/** Pull only: the Penpot shape type this placeholder stands in for (R8.1). */
			unsupported?: string;
			_classes?: string;
	  }
	| {
			kind: "component";
			id?: string;
			set: string;
			variant: Record<string, string>;
			slots: Record<string, TextValue>;
			layoutChild?: LayoutChild;
	  }
	| {
			kind: "text";
			id?: string;
			value: TextValue;
			style: StyleRefs;
			layoutChild?: LayoutChild;
			_classes?: string;
	  };

export type ScreenNode = Extract<Node, { kind: "screen" }>;

export const SCREEN_ID_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export const TextValueSchema: z.ZodType<TextValue> = z.union([
	z
		.object({
			key: z.string().min(1),
			params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
		})
		.strict(),
	z.object({ literal: z.string() }).strict(),
]);

export const DimSchema: z.ZodType<Dim> = z.union([
	z.object({ token: z.string().min(1) }).strict(),
	z.object({ px: z.number() }).strict(),
]);

export const LayoutSchema: z.ZodType<Layout> = z
	.object({
		dir: z.enum(["column", "row", "none"]),
		gap: DimSchema.optional(),
		padding: z.tuple([DimSchema, DimSchema, DimSchema, DimSchema]).optional(),
		align: z.enum(["start", "center", "end", "stretch"]).optional(),
		justify: z.enum(["start", "center", "end", "between"]).optional(),
		wrap: z.boolean().optional(),
	})
	.strict();

export const StyleRefsSchema: z.ZodType<StyleRefs> = z
	.object({
		fill: z.string().optional(),
		stroke: z.string().optional(),
		radius: z.string().optional(),
		shadow: z.string().optional(),
		typography: z.string().optional(),
	})
	.strict();

const Sizing = z.enum(["fix", "fill", "auto"]);

export const LayoutChildSchema: z.ZodType<LayoutChild> = z
	.object({
		h: Sizing.optional(),
		v: Sizing.optional(),
		width: z.number().optional(),
		height: z.number().optional(),
	})
	.strict();

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
	z.union([
		z
			.object({
				kind: z.literal("screen"),
				id: z.string().regex(SCREEN_ID_PATTERN),
				platform: z.enum(["web", "ios", "android"]),
				title: z.string().min(1),
				layout: LayoutSchema,
				children: z.array(NodeSchema),
				_classes: z.string().optional(),
			})
			.strict(),
		z
			.object({
				kind: z.literal("frame"),
				id: z.string().optional(),
				name: z.string().optional(),
				layout: LayoutSchema,
				style: StyleRefsSchema,
				children: z.array(NodeSchema),
				layoutChild: LayoutChildSchema.optional(),
				unsupported: z.string().optional(),
				_classes: z.string().optional(),
			})
			.strict(),
		z
			.object({
				kind: z.literal("component"),
				id: z.string().optional(),
				set: z.string().min(1),
				variant: z.record(z.string(), z.string()),
				slots: z.record(z.string(), TextValueSchema),
				layoutChild: LayoutChildSchema.optional(),
			})
			.strict(),
		z
			.object({
				kind: z.literal("text"),
				id: z.string().optional(),
				value: TextValueSchema,
				style: StyleRefsSchema,
				layoutChild: LayoutChildSchema.optional(),
				_classes: z.string().optional(),
			})
			.strict(),
	]),
);
