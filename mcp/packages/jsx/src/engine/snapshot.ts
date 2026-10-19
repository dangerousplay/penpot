// GENERATED from nova-terra tools/design-bridge/src/engine/snapshot.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// The live library snapshot the registry is built from (design §5). The server fetches it from the
// open Penpot file; the Nova Terra adapter converts its committed JSON snapshot to this shape.
// "light" parts are always present; per-variant detail (`textSlots`, sizes) only for fetched sets.

import { z } from "zod";

export const LiveVariantSchema = z.object({
	componentId: z.string(),
	variantProps: z.record(z.string(), z.string()),
	mainInstanceId: z.string().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	/** Text layer names in tree order; a repeated name is a duplicate layer. */
	textSlots: z.array(z.string()).optional(),
});

export const LiveSetSchema = z.object({
	set: z.string(),
	library: z.string().optional(),
	libraryId: z.string().optional(),
	variantsId: z.string().nullable().optional(),
	properties: z.array(z.string()),
	values: z.record(z.string(), z.array(z.string())),
	variants: z.array(LiveVariantSchema),
});

export const TokenCatalogSchema = z.object({
	sets: z.array(
		z.object({
			name: z.string(),
			active: z.boolean(),
			tokens: z.array(
				z.object({
					name: z.string(),
					type: z.string(),
					value: z.unknown(),
					resolvedValue: z.unknown().optional(),
				}),
			),
		}),
	),
	themes: z
		.array(
			z.object({
				group: z.string().optional(),
				name: z.string(),
				active: z.boolean(),
				activeSets: z.array(z.string()),
			}),
		)
		.default([]),
});

export const LiveSnapshotSchema = z.object({
	penpotVersion: z.string(),
	file: z.union([z.string(), z.object({ id: z.string().optional(), name: z.string().nullable() })]).nullable().optional(),
	currentPage: z.string().optional(),
	pages: z.array(z.object({ name: z.string(), id: z.string() })).default([]),
	sets: z.array(LiveSetSchema),
	/** Top-level boards of the current page; used to derive platform preset sizes. */
	presets: z.array(z.object({ name: z.string(), width: z.number(), height: z.number() })).default([]),
	tokens: TokenCatalogSchema.optional(),
});

export type LiveVariant = z.infer<typeof LiveVariantSchema>;
export type LiveSet = z.infer<typeof LiveSetSchema>;
export type TokenCatalog = z.infer<typeof TokenCatalogSchema>;
export type LiveSnapshot = z.infer<typeof LiveSnapshotSchema>;
