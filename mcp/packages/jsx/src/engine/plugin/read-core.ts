// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/read-core.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Raw facts the in-Penpot reader (read.ts) returns. Plain JSON, compact: defaults are
// omitted. src/pull/to-ir.ts turns this into IR on the CLI side, where the token-name
// tables and the i18n bundle live. No imports at runtime: bundled into the plugin IIFE.

export interface RawText {
	text: string;
	/** `nova-terra/i18n` tag. */
	key?: string;
	/** `nova-terra/i18nParams` tag (omitted when empty). */
	params?: Record<string, string | number>;
	hidden?: boolean;
}

export interface RawFlex {
	/** Penpot `flex.dir`: row, column, row-reverse, column-reverse. */
	dir: string;
	wrap?: boolean;
	align?: string;
	justify?: string;
	rowGap?: number;
	columnGap?: number;
	/** top, right, bottom, left */
	pad?: [number, number, number, number];
	/** `flex.horizontalSizing` / `verticalSizing` of the board itself: fix | auto. */
	hs?: string;
	vs?: string;
}

/** `shape.layoutChild` sizing inside a flex parent: fix | fill | auto. */
export interface RawChild {
	h?: string;
	v?: string;
}

interface RawBase {
	/** `nova-terra/node` tag. Absent on hand-built shapes. */
	node?: string;
	w: number;
	h: number;
	child?: RawChild;
	/** `shape.tokens`: token property -> token name. */
	tokens?: Record<string, string>;
}

export type RawNode =
	| (RawBase & { t: "board"; name: string; flex?: RawFlex; children: RawNode[] })
	| (RawBase & { t: "text"; text: RawText; grow?: string })
	| (RawBase & {
			t: "copy";
			set: string;
			props: Record<string, string>;
			mainW: number;
			mainH: number;
			/** Text layers that differ from the main component or carry an i18n tag. */
			slots: Record<string, RawText>;
			/** Untagged layers whose text equals the main component's: layer -> the main's text. */
			same: Record<string, string>;
	  })
	| (RawBase & { t: "other"; name: string; type: string });

export interface RawBoard {
	boardId: string;
	page: string;
	name: string;
	/** `nova-terra/screenId` tag. Absent on hand-built boards. */
	screenId?: string;
	/** `nova-terra/platform` tag. */
	platform?: string;
	w: number;
	h: number;
	flex?: RawFlex;
	tokens?: Record<string, string>;
	children: RawNode[];
}

export interface ReadQuery {
	/** Screen id or board name. */
	board: string;
	/** Page name; without it every page's top level is searched. */
	page?: string;
}

/** Page-name comparison used by the reader (same rule as render-core's guard). */
export function sameName(a: string, b: string): boolean {
	const n = (s: string) => s.replace(/[\s ]+/g, " ").trim().toLowerCase();
	return n(a) === n(b);
}
