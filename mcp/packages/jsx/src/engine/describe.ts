// GENERATED from nova-terra tools/design-bridge/src/engine/describe.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// `describeComponents` (design §6, `jsx_components`): the registry as TypeScript-like signatures an
// agent can read. One line per tag, alphabetical, at most 120 characters, deterministic.

import type { Registry, RegistryComponent } from "./registry";
import type { Theme } from "./theme";

export const MAX_LINE = 120;

export interface DescribeOptions {
	/** Substring (case-insensitive) or glob (`*`, `?`) on the tag or the Penpot set name. */
	filter?: string;
	/** `false` omits slots (the detail pass was skipped). Default: slots are shown. */
	detail?: boolean;
	/** Shown in the header when known. */
	file?: string;
	penpotVersion?: string;
}

const PRIMITIVES = [
	"// Primitives: Screen{id,title,platform?,width?,height?,className}, Stack, Row, Box{className},",
	"// Text{value|children,className}; t(key, params?); component props: variant props, slot props (Text), id, className",
];

const CLASSES = [
	"// Classes: bg-/text-/border-<color> · p-/px-/py-/gap-<spacing> · rounded-<radius> · shadow-<shadow>",
	"// Classes: w-/h-[Npx] · w-full · flex-1 · items-* · justify-*",
];

function matcher(filter: string | undefined): (c: RegistryComponent) => boolean {
	if (filter === undefined || filter === "") return () => true;
	if (/[*?]/.test(filter)) {
		const escaped = filter.replace(/[\\^$.+()|{}[\]]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
		const re = new RegExp(`^${escaped}$`, "i");
		return (c) => re.test(c.tag) || re.test(c.set);
	}
	const needle = filter.toLowerCase();
	return (c) => c.tag.toLowerCase().includes(needle) || c.set.toLowerCase().includes(needle);
}

function quoted(v: string): string {
	return JSON.stringify(v);
}

/** `keep` caps the listed values per prop; the rest become `…(+n)`. */
function propText(c: RegistryComponent, keep: number): string[] {
	return Object.entries(c.propKeys).map(([key, penpot]) => {
		const values = c.group.values[penpot] ?? [];
		const shown = values.slice(0, keep).map(quoted);
		if (values.length > keep) shown.push(`…(+${values.length - keep})`);
		const def = c.defaults[penpot];
		const union = shown.length > 0 ? shown.join(" | ") : "string";
		return def === undefined ? `${key}: ${union}` : `${key}?: ${union} = ${quoted(def)}`;
	});
}

function line(c: RegistryComponent, detail: boolean, keep: number, withLibrary: boolean, slotLimit: number): string {
	const slots = detail ? Object.keys(c.slots) : [];
	const shownSlots = slots.slice(0, slotLimit).map((s) => `${s}?: Text`);
	if (slots.length > slotLimit) shownSlots.push(`…(+${slots.length - slotLimit})`);
	const members = [...propText(c, keep), ...shownSlots];
	const body = members.length === 0 ? "{ }" : `{ ${members.join("; ")} }`;
	const lib = withLibrary && c.library !== undefined ? `  // library ${quoted(c.library)}` : "";
	return `${c.tag} ${body}${lib}`;
}

/** The longest signature that fits: drop the library note, then enum values, then slots. */
function fit(c: RegistryComponent, detail: boolean): string {
	const maxValues = Math.max(1, ...Object.values(c.group.values).map((v) => v.length));
	const all = Number.MAX_SAFE_INTEGER;
	const full = line(c, detail, maxValues, true, all);
	if (full.length <= MAX_LINE) return full;
	for (let keep = maxValues; keep >= 1; keep--) {
		const l = line(c, detail, keep, false, all);
		if (l.length <= MAX_LINE) return l;
	}
	for (let slots = Object.keys(c.slots).length; slots >= 0; slots--) {
		const l = line(c, detail, 1, false, slots);
		if (l.length <= MAX_LINE) return l;
	}
	return `${line(c, detail, 1, false, 0).slice(0, MAX_LINE - 1)}…`;
}

export function describeComponents(reg: Registry, theme: Theme, o: DescribeOptions = {}): string {
	const detail = o.detail !== false;
	const all = Object.values(reg.components);
	const picked = all.filter(matcher(o.filter)).sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
	const counts = `theme: ${Object.keys(theme.colors).length} colors, ${Object.keys(theme.spacing).length} spacing, ${Object.keys(theme.radius).length} radius, ${Object.keys(theme.shadow).length} shadow`;
	const header = (file: string | undefined): string =>
		`// ${[
			...(file !== undefined ? [`Penpot file ${quoted(file)}`] : []),
			...(o.penpotVersion !== undefined ? [o.penpotVersion] : []),
			`${picked.length === all.length ? all.length : `${picked.length} of ${all.length}`} components`,
			counts,
		].join(" · ")}`;
	let file = o.file;
	let headerLine = header(file);
	// A long file name is the only unbounded part: cut it (with an ellipsis) until the line fits.
	while (file !== undefined && headerLine.length > MAX_LINE && file !== "…") {
		const over = headerLine.length - MAX_LINE;
		file = `${file.slice(0, Math.max(0, file.length - over - 1))}…`;
		headerLine = header(file);
	}
	if (headerLine.length > MAX_LINE) headerLine = `${headerLine.slice(0, MAX_LINE - 1)}…`;
	return [headerLine, ...picked.map((c) => fit(c, detail)), ...PRIMITIVES, ...CLASSES].join("\n");
}

