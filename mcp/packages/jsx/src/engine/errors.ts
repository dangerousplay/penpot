// GENERATED from nova-terra tools/design-bridge/src/engine/errors.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// Tool-local error type of the engine (design §10). Codes are stable strings read by agents;
// they are not product error codes and have no i18n bundle.

export type JsxErrorCode =
	| "JSX_SYNTAX"
	| "JSX_IMPORT"
	| "JSX_NO_SCREENS"
	| "JSX_TOO_LARGE"
	| "JSX_EVAL"
	| "JSX_UNKNOWN_COMPONENT"
	| "JSX_AMBIGUOUS_TAG"
	| "JSX_INVALID_PROP"
	| "JSX_INVALID_VALUE"
	| "JSX_INVALID_VARIANT"
	| "JSX_UNKNOWN_SLOT"
	| "JSX_MISSING_PROP"
	| "JSX_MISSING_MESSAGE"
	| "JSX_DUPLICATE_SCREEN"
	| "JSX_INVALID_NODE"
	| "PROFILE_INVALID"
	| "SNAPSHOT_INVALID"
	| "TOKENS_INVALID"
	// Plugin-runtime codes (T4, design §10): raised inside Penpot and serialized by the runtime.
	| "PAGE_FORBIDDEN"
	| "BOARD_NOT_FOUND"
	| "SNAPSHOT_TOO_LARGE"
	| "BUDGET_EXCEEDED"
	| "INVALID_ARGS"
	| "PLUGIN_ERROR";

export interface JsxErrorWhere {
	line?: number;
	column?: number;
	path?: string;
	hint?: string;
	valid?: string[];
}

export class JsxError extends Error {
	readonly code: JsxErrorCode;
	line?: number;
	column?: number;
	path?: string;
	hint?: string;
	valid?: string[];

	constructor(code: JsxErrorCode, message: string, where: JsxErrorWhere = {}) {
		super(message);
		this.name = "JsxError";
		this.code = code;
		if (where.line !== undefined) this.line = where.line;
		if (where.column !== undefined) this.column = where.column;
		if (where.path !== undefined) this.path = where.path;
		if (where.hint !== undefined) this.hint = where.hint;
		if (where.valid !== undefined) this.valid = where.valid;
	}

	/** The compact `{code, message, ...}` shape of the tool result (design §9). */
	toJSON(): { code: JsxErrorCode; message: string } & JsxErrorWhere {
		const out: { code: JsxErrorCode; message: string } & JsxErrorWhere = { code: this.code, message: this.message };
		if (this.line !== undefined) out.line = this.line;
		if (this.column !== undefined) out.column = this.column;
		if (this.path !== undefined) out.path = this.path;
		if (this.hint !== undefined) out.hint = this.hint;
		if (this.valid !== undefined) out.valid = this.valid;
		return out;
	}
}

export function isJsxError(e: unknown): e is JsxError {
	return e instanceof JsxError;
}
