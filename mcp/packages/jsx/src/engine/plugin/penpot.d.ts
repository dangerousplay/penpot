// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/penpot.d.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Minimal local subset of the Penpot plugin API used by the in-Penpot bundle.
// Source of truth: penpot/plugins/libs/plugin-types/index.d.ts

interface PenpotShape {
	readonly id: string;
	readonly type: string;
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly children?: PenpotShape[];
}

interface PenpotVariants {
	readonly id: string;
	readonly name?: string;
	readonly properties: string[];
	currentValues(property: string): string[];
	variantComponents(): PenpotLibraryComponent[];
}

interface PenpotLibraryComponent {
	readonly id: string;
	readonly name: string;
	readonly path?: string;
	readonly variants?: PenpotVariants | null;
	readonly variantProps?: { [property: string]: string };
	isVariant(): boolean;
	mainInstance(): PenpotShape;
}

interface PenpotToken {
	readonly name: string;
	readonly type: string;
	readonly value: unknown;
}

interface PenpotTokenSet {
	readonly name: string;
	readonly active: boolean;
	readonly tokens: PenpotToken[];
}

interface PenpotTokenTheme {
	readonly group: string;
	readonly name: string;
	readonly active: boolean;
	readonly activeSets: PenpotTokenSet[];
}

interface PenpotPage {
	readonly id: string;
	readonly name: string;
	readonly root: PenpotShape;
}

interface PenpotFile {
	readonly name: string;
	readonly pages: PenpotPage[];
}

interface PenpotContext {
	readonly version: string;
	readonly currentFile: PenpotFile | null;
	readonly currentPage: PenpotPage | null;
	readonly library: {
		/** Connected shared libraries (Penpot >= 2.18). */
		readonly connected?: { readonly id: string; readonly name: string; readonly components: PenpotLibraryComponent[] }[];
		readonly local: {
			readonly components: PenpotLibraryComponent[];
			readonly tokens: {
				readonly sets: PenpotTokenSet[];
				readonly themes: PenpotTokenTheme[];
			};
		};
	};
}

declare const penpot: PenpotContext;
