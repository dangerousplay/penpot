import { JsxError, type JsxErrorCode, type JsxErrorWhere } from "@penpot/mcp-jsx";
import { TextResponse } from "../ToolResponse";

/**
 * Tool-local error codes raised by the server transport and inputs (design section 10).
 * The engine's own codes ({@link JsxErrorCode}) are not repeated here.
 */
export type TransportErrorCode =
    | "PLUGIN_NOT_CONNECTED"
    | "SESSION_AMBIGUOUS"
    | "PLUGIN_TIMEOUT"
    | "RUNTIME_INSTALL_FAILED"
    | "INTERNAL"
    | "SELECTION_EMPTY"
    | "RESULT_TOO_LARGE"
    | "SOURCE_TOO_LARGE"
    | "FS_DISABLED"
    | "TOKENS_CONFIRM_REQUIRED";

export type ToolErrorCode = JsxErrorCode | TransportErrorCode;

/**
 * An expected, agent-facing failure carrying a stable tool-local code.
 * Tools return it through {@link fail}; they never let it escape as an exception.
 */
export class JsxToolError extends Error {
    readonly code: ToolErrorCode;
    line?: number;
    column?: number;
    path?: string;
    hint?: string;
    valid?: string[];
    /** extra top-level fields of the failure result (for example a report the agent should see) */
    payload?: Record<string, unknown>;

    constructor(code: ToolErrorCode, message: string, where: JsxErrorWhere = {}) {
        super(message);
        this.name = "JsxToolError";
        this.code = code;
        if (where.line !== undefined) this.line = where.line;
        if (where.column !== undefined) this.column = where.column;
        if (where.path !== undefined) this.path = where.path;
        if (where.hint !== undefined) this.hint = where.hint;
        if (where.valid !== undefined) this.valid = where.valid;
    }

    toJSON(): { code: ToolErrorCode; message: string } & JsxErrorWhere {
        const out: { code: ToolErrorCode; message: string } & JsxErrorWhere = {
            code: this.code,
            message: this.message,
        };
        if (this.line !== undefined) out.line = this.line;
        if (this.column !== undefined) out.column = this.column;
        if (this.path !== undefined) out.path = this.path;
        if (this.hint !== undefined) out.hint = this.hint;
        if (this.valid !== undefined) out.valid = this.valid;
        return out;
    }
}

/** Lists longer than this are truncated by {@link ok} unless they were capped explicitly. */
export const DEFAULT_LIST_CAP = 200;

/**
 * Caps a list and reports the full size: returns `{ [name]: first max items, [name + "Count"]: total }`.
 */
export function capList<T>(name: string, items: readonly T[], max: number): Record<string, unknown> {
    return { [name]: items.slice(0, max), [`${name}Count`]: items.length };
}

/**
 * Builds the success result: one compact JSON text item `{ok: true, ...payload}`.
 * Top-level arrays above {@link DEFAULT_LIST_CAP} are truncated and get a `<name>Count` field.
 */
export function ok(payload: Record<string, unknown> = {}): TextResponse {
    const body: Record<string, unknown> = { ok: true };
    for (const [key, value] of Object.entries(payload)) {
        if (Array.isArray(value) && value.length > DEFAULT_LIST_CAP) {
            body[key] = value.slice(0, DEFAULT_LIST_CAP);
            body[`${key}Count`] = value.length;
        } else {
            body[key] = value;
        }
    }
    return new TextResponse(JSON.stringify(body));
}

/**
 * Builds the failure result: one compact JSON text item `{ok: false, error: {code, message, ...}}`.
 *
 * @param error - a {@link JsxError} / {@link JsxToolError}, or a bare code (then `message` is required)
 * @param message - overrides the message when given
 * @param extra - additional `line`, `column`, `path`, `hint`, `valid` fields
 */
export function fail(
    error: JsxError | JsxToolError | ToolErrorCode,
    message?: string,
    extra: JsxErrorWhere = {}
): TextResponse {
    const code: ToolErrorCode = typeof error === "string" ? error : error.code;
    const text = message ?? (typeof error === "string" ? error : error.message);
    const base: JsxErrorWhere = {};
    if (typeof error !== "string") {
        if (error.line !== undefined) base.line = error.line;
        if (error.column !== undefined) base.column = error.column;
        if (error.path !== undefined) base.path = error.path;
        if (error.hint !== undefined) base.hint = error.hint;
        if (error.valid !== undefined) base.valid = error.valid;
    }
    // Payload first so it can never overwrite the reserved `ok` / `error` keys.
    const body = {
        ...(typeof error !== "string" && "payload" in error && error.payload !== undefined ? error.payload : {}),
        ok: false,
        error: { code, message: text, ...base, ...extra },
    };
    return new TextResponse(JSON.stringify(body));
}

/** Every code a tool result may carry; the plugin runtime's codes are checked against it. */
export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<ToolErrorCode>([
    "JSX_SYNTAX",
    "JSX_IMPORT",
    "JSX_NO_SCREENS",
    "JSX_TOO_LARGE",
    "JSX_EVAL",
    "JSX_UNKNOWN_COMPONENT",
    "JSX_AMBIGUOUS_TAG",
    "JSX_INVALID_PROP",
    "JSX_INVALID_VALUE",
    "JSX_INVALID_VARIANT",
    "JSX_UNKNOWN_SLOT",
    "JSX_MISSING_PROP",
    "JSX_MISSING_MESSAGE",
    "JSX_DUPLICATE_SCREEN",
    "JSX_INVALID_NODE",
    "PROFILE_INVALID",
    "SNAPSHOT_INVALID",
    "TOKENS_INVALID",
    "PAGE_FORBIDDEN",
    "BOARD_NOT_FOUND",
    "SNAPSHOT_TOO_LARGE",
    "BUDGET_EXCEEDED",
    "INVALID_ARGS",
    "PLUGIN_ERROR",
    "PLUGIN_NOT_CONNECTED",
    "SESSION_AMBIGUOUS",
    "PLUGIN_TIMEOUT",
    "RUNTIME_INSTALL_FAILED",
    "INTERNAL",
    "SELECTION_EMPTY",
    "RESULT_TOO_LARGE",
    "SOURCE_TOO_LARGE",
    "FS_DISABLED",
    "TOKENS_CONFIRM_REQUIRED",
]);
