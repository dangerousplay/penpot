// GENERATED from nova-terra tools/design-bridge/src/engine/index.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Public API of the generic engine, push half (design §2.3). Everything here is pure TypeScript with
// no Node, Bun or DOM dependency, so the directory can be vendored into any package.

export { JsxError, isJsxError } from "./errors";
export type { JsxErrorCode, JsxErrorWhere } from "./errors";

export { camelCase, canonicalTag, levenshtein, pascalCase, sanitizeIdent, setSegments, suggest } from "./naming";

export { ProfileSchema, mergeGuards, parseProfile } from "./profile";
export type { Profile } from "./profile";

export { LiveSnapshotSchema, TokenCatalogSchema } from "./snapshot";
export type { LiveSet, LiveSnapshot, LiveVariant, TokenCatalog } from "./snapshot";

export {
	BASE_IMPORT,
	buildComponent,
	buildRegistry,
	expandChrome,
	importSpecifiers,
	nearestCombinations,
	parseLayerRef,
	resolveTag,
	scopeOf,
} from "./registry";
export type {
	BuildComponentOptions,
	ChromePart,
	ComponentInput,
	EvalScope,
	Registry,
	RegistryChrome,
	RegistryComponent,
	Size,
} from "./registry";

export { activeTokens, emptyTheme, themeFromCode, themeFromTokens } from "./theme";
export type { CodeTokenGroup, CodeTokens, Theme, ThemeCollision, ThemeColor, ThemeFamily, ThemeNumber, ThemeShadow } from "./theme";

export { compileMessages, interpolate, lookup, resolveText } from "./i18n";
export type { CompiledMessages, Messages, TextOptions } from "./i18n";

export * from "./ir/schema";
export { isAutoId, normalize, tokenValueDim } from "./ir/normalize";
export type { NormalizeOptions } from "./ir/normalize";
export { collectScreens } from "./ir/collect";

export { resolve, toClasses } from "./tailwind";
export type { ResolvedClasses, ResolveOptions, ToClassesOptions } from "./tailwind";

export { findImportLine, transpile } from "./jsx/transpile";
export type { TranspileOptions } from "./jsx/transpile";
export { PRIMITIVE_TAGS, collectTags, flattenChildren, isElement } from "./jsx/elements";
export type { Element } from "./jsx/elements";
export { createJsxContext } from "./jsx/context";
export type { DimInput, JsxContext, JsxContextInit, LayoutProps, PaddingInput, ScreenProps, TextProps } from "./jsx/context";
export { replay } from "./jsx/replay";
export type { ReplayResult } from "./jsx/replay";

export { prepareScreen } from "./push/prepare";
export type { PrepareCtx } from "./push/prepare";
export { isForbiddenPage, matchVariant, normalizePageName, safeName } from "./push/render-model";
export type { RDim, RLayout, RNode, RScreen, RStyle, RText, RToken, VariantEntry } from "./push/render-model";

export { emitJsx } from "./emit/jsx";
export type { EmitCtx, EmitResult } from "./emit/jsx";
export { compareScreen, deepDiff, pullBoard, unwrapRead } from "./pull/core";
export type { Compared, DiffEntry, Pulled, PullCtx } from "./pull/core";
export { formatDrift, reconcileDropped, slugify, toIr } from "./pull/to-ir";
export type { Drift, DroppedSlot, ToIrOptions, ToIrResult } from "./pull/to-ir";
export type { RawBoard, RawChild, RawFlex, RawNode, RawText } from "./pull/raw";
export { describeComponents } from "./describe";
export type { DescribeOptions } from "./describe";
export { parseDtcg } from "./tokens/dtcg";
export * from "./tokens/model";
