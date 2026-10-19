// GENERATED from nova-terra tools/design-bridge/src/engine/naming.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Naming rules of the generic registry (design §6; context D5-D7). Pure string functions.

/** `camelCase("Cause Tile")` -> `causeTile`. Words split on anything that is not a letter or digit. */
export function camelCase(property: string): string {
	const words = property.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
	return words
		.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
		.join("");
}

/** Word split on non-letters/digits, first letter uppercased, the rest kept ("iOS" -> "IOS"). */
export function pascalCase(text: string): string {
	return text
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length > 0)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join("");
}

const IDENT_START = /^[\p{L}_$]/u;
const INVALID_CHARS = /[^\p{L}\p{N}_$]/gu;

/** A valid JSX identifier segment: invalid characters dropped, `_` before a leading digit, `_` if empty. */
export function sanitizeIdent(segment: string): string {
	const cleaned = segment.replace(INVALID_CHARS, "");
	if (cleaned.length === 0) return "_";
	return IDENT_START.test(cleaned) ? cleaned : `_${cleaned}`;
}

/** The path segments of a Penpot set name: `iOS · Status Bar` -> [`iOS`, `Status Bar`]. */
export function setSegments(set: string): string[] {
	const parts = set
		.split(/\s*(?:·|\/)\s*/u)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	return parts.length > 0 ? parts : [set.trim()];
}

/** Canonical tag of a set: PascalCase of each segment, sanitized, joined with `.`. */
export function canonicalTag(set: string): string {
	return setSegments(set)
		.map((seg) => sanitizeIdent(pascalCase(seg)))
		.join(".");
}

/** The last segment of a canonical tag (the candidate flat alias). */
export function lastSegment(tag: string): string {
	const i = tag.lastIndexOf(".");
	return i < 0 ? tag : tag.slice(i + 1);
}

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
		}
		prev = cur;
	}
	return prev[b.length]!;
}

/** "Did you mean" candidates: case-insensitive distance, closest first, ties in input order. */
export function suggest(name: string, candidates: readonly string[], limit = 3): string[] {
	const lower = name.toLowerCase();
	const maxDistance = Math.max(2, Math.floor(name.length / 3));
	return candidates
		.map((c, i) => ({ c, i, d: levenshtein(lower, c.toLowerCase()) }))
		.filter((x) => x.d <= maxDistance)
		.sort((a, b) => a.d - b.d || a.i - b.i)
		.slice(0, limit)
		.map((x) => x.c);
}
