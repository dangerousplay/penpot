import * as fs from "fs";
import * as path from "path";
import { parseProfile, type Profile } from "@penpot/mcp-jsx";
import { JsxToolError, type ToolErrorCode } from "./results";

/** Inline `source` / on-disk `sourcePath` cap (design section 9.2). */
export const MAX_SOURCE_BYTES = 256 * 1024;
/** Inline `messages` cap, measured on the serialized JSON (design section 8). */
export const MAX_MESSAGES_BYTES = 512 * 1024;
/** `messagesPath` cap on disk (design section 8). */
export const MAX_MESSAGES_FILE_BYTES = 2 * 1024 * 1024;
/** Inline `tokens` cap, measured on the serialized JSON. */
export const MAX_TOKENS_BYTES = 1024 * 1024;
/** `tokensPath` cap on disk. */
export const MAX_TOKENS_FILE_BYTES = 2 * 1024 * 1024;
/** Inline profile and profile file cap. */
export const MAX_PROFILE_BYTES = 256 * 1024;

/** The part of the MCP server the `*Path` arguments depend on. */
export interface FsAccess {
    isFileSystemAccessEnabled(): boolean;
    /** optional allowlist (PENPOT_MCP_JSX_FS_ROOTS); when non-empty, real paths must sit under one root */
    fsRoots?: readonly string[];
}

const SOURCE_EXTENSIONS: readonly string[] = [".tsx", ".jsx", ".ts", ".js"];
const JSON_EXTENSIONS: readonly string[] = [".json"];

interface FileSpec {
    /** argument name, for messages */
    arg: string;
    maxBytes: number;
    /** code for an over-cap file */
    tooLarge: ToolErrorCode;
    /** code for an unreadable / non-absolute / malformed file */
    invalid: ToolErrorCode;
    /** allowed lower-case extensions of the resolved file; unchecked when omitted */
    extensions?: readonly string[];
}

/**
 * Resolves a `*Path` argument to a real path after the local-mode guard, the absolute check and the size cap.
 * A missing `fsAccess` skips the guard (operator-supplied startup files).
 */
function resolveGuardedFile(fsAccess: FsAccess | undefined, filePath: string, spec: FileSpec): string {
    if (fsAccess !== undefined && !fsAccess.isFileSystemAccessEnabled()) {
        throw new JsxToolError(
            "FS_DISABLED",
            `${spec.arg} is not available: file system access is disabled (remote or multi-user mode)`,
            { hint: "send the content inline instead of a path" }
        );
    }
    if (!path.isAbsolute(filePath)) {
        throw new JsxToolError(spec.invalid, `${spec.arg} must be an absolute path: ${filePath}`);
    }
    let real: string;
    let size: number;
    try {
        real = fs.realpathSync(filePath);
        const stat = fs.statSync(real);
        if (!stat.isFile()) {
            throw new JsxToolError(spec.invalid, `${spec.arg} is not a regular file`);
        }
        size = stat.size;
    } catch (e) {
        if (e instanceof JsxToolError) throw e;
        throw new JsxToolError(spec.invalid, `${spec.arg}: file not found or not accessible`);
    }
    if (spec.extensions !== undefined && !spec.extensions.includes(path.extname(real).toLowerCase())) {
        throw new JsxToolError(
            spec.invalid,
            `${spec.arg} must have one of the extensions ${spec.extensions.join(", ")}`
        );
    }
    if (fsAccess?.fsRoots !== undefined && fsAccess.fsRoots.length > 0 && !isUnderRoots(real, fsAccess.fsRoots)) {
        throw new JsxToolError(spec.invalid, `${spec.arg} is outside the allowed roots`, {
            hint: "see PENPOT_MCP_JSX_FS_ROOTS",
        });
    }
    if (size > spec.maxBytes) {
        throw new JsxToolError(spec.tooLarge, `${spec.arg} is ${size} bytes; the cap is ${spec.maxBytes}`);
    }
    return real;
}

function isUnderRoots(real: string, roots: readonly string[]): boolean {
    return roots.some((root) => {
        let realRoot: string;
        try {
            realRoot = fs.realpathSync(root);
        } catch {
            return false;
        }
        const rel = path.relative(realRoot, real);
        return rel === "" || (!(rel === ".." || rel.startsWith(".." + path.sep)) && !path.isAbsolute(rel));
    });
}

/** Reads a validated file; OS errors (which carry paths and errno) are replaced by a fixed message. */
function readText(real: string, spec: FileSpec): string {
    try {
        return fs.readFileSync(real, "utf8");
    } catch {
        throw new JsxToolError(spec.invalid, `${spec.arg}: file could not be read`);
    }
}

function parseJsonText(text: string, arg: string, code: ToolErrorCode): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        // never echo the parser message: it quotes file content
        throw new JsxToolError(code, `${arg} is not valid JSON`);
    }
}

function requireAtMostOne(arg: string, pathArg: string, inline: unknown, filePath: string | undefined): void {
    if (inline !== undefined && filePath !== undefined) {
        throw new JsxToolError("INVALID_ARGS", `pass either ${arg} or ${pathArg}, not both`);
    }
}

function serializedSize(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

/**
 * Loads the JSX source: exactly one of inline `source` or `sourcePath` (local mode only).
 */
export function loadSource(args: { source?: string; sourcePath?: string }, fsAccess: FsAccess): string {
    requireAtMostOne("source", "sourcePath", args.source, args.sourcePath);
    if (args.source !== undefined) {
        const size = Buffer.byteLength(args.source, "utf8");
        if (size > MAX_SOURCE_BYTES) {
            throw new JsxToolError("SOURCE_TOO_LARGE", `source is ${size} bytes; the cap is ${MAX_SOURCE_BYTES}`, {
                hint: "split the screens over several jsx_push calls",
            });
        }
        return args.source;
    }
    if (args.sourcePath !== undefined) {
        const spec: FileSpec = {
            arg: "sourcePath",
            maxBytes: MAX_SOURCE_BYTES,
            tooLarge: "SOURCE_TOO_LARGE",
            invalid: "INVALID_ARGS",
            extensions: SOURCE_EXTENSIONS,
        };
        return readText(resolveGuardedFile(fsAccess, args.sourcePath, spec), spec);
    }
    throw new JsxToolError("INVALID_ARGS", "pass either source or sourcePath");
}

/**
 * Loads i18n messages (nested or flat): inline `messages` or `messagesPath` (local mode only); optional.
 */
export function loadMessages(
    args: { messages?: Record<string, unknown>; messagesPath?: string },
    fsAccess: FsAccess
): Record<string, unknown> | undefined {
    requireAtMostOne("messages", "messagesPath", args.messages, args.messagesPath);
    if (args.messages !== undefined) {
        const size = serializedSize(args.messages);
        if (size > MAX_MESSAGES_BYTES) {
            throw new JsxToolError("INVALID_ARGS", `messages is ${size} bytes; the cap is ${MAX_MESSAGES_BYTES}`, {
                hint: "use messagesPath in local mode, or send only the keys the screens use",
            });
        }
        return args.messages;
    }
    if (args.messagesPath !== undefined) {
        const spec: FileSpec = {
            arg: "messagesPath",
            maxBytes: MAX_MESSAGES_FILE_BYTES,
            tooLarge: "INVALID_ARGS",
            invalid: "INVALID_ARGS",
            extensions: JSON_EXTENSIONS,
        };
        const text = readText(resolveGuardedFile(fsAccess, args.messagesPath, spec), spec);
        const parsed = parseJsonText(text, "messagesPath", "INVALID_ARGS");
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new JsxToolError("INVALID_ARGS", "messagesPath must contain a JSON object");
        }
        return parsed as Record<string, unknown>;
    }
    return undefined;
}

/**
 * Loads DTCG tokens: inline `tokens` or `tokensPath` (local mode only); optional.
 */
export function loadTokens(args: { tokens?: unknown; tokensPath?: string }, fsAccess: FsAccess): unknown {
    requireAtMostOne("tokens", "tokensPath", args.tokens, args.tokensPath);
    if (args.tokens !== undefined) {
        const size = serializedSize(args.tokens);
        if (size > MAX_TOKENS_BYTES) {
            throw new JsxToolError("INVALID_ARGS", `tokens is ${size} bytes; the cap is ${MAX_TOKENS_BYTES}`, {
                hint: "use tokensPath in local mode",
            });
        }
        return args.tokens;
    }
    if (args.tokensPath !== undefined) {
        const spec: FileSpec = {
            arg: "tokensPath",
            maxBytes: MAX_TOKENS_FILE_BYTES,
            tooLarge: "INVALID_ARGS",
            invalid: "TOKENS_INVALID",
            extensions: JSON_EXTENSIONS,
        };
        return parseJsonText(
            readText(resolveGuardedFile(fsAccess, args.tokensPath, spec), spec),
            "tokensPath",
            "TOKENS_INVALID"
        );
    }
    return undefined;
}

function validateProfile(raw: unknown): Profile {
    try {
        return parseProfile(raw);
    } catch (e) {
        throw new JsxToolError("PROFILE_INVALID", e instanceof Error ? e.message : String(e));
    }
}

/**
 * Loads the per-call profile: an inline object validated by `ProfileSchema`. A profile file is operator
 * configuration and goes through {@link loadProfileFile} (JsxConfig). Optional.
 */
export function loadProfile(args: { profile?: unknown }): Profile | undefined {
    if (args.profile === undefined) {
        return undefined;
    }
    const size = serializedSize(args.profile);
    if (size > MAX_PROFILE_BYTES) {
        throw new JsxToolError("PROFILE_INVALID", `profile is ${size} bytes; the cap is ${MAX_PROFILE_BYTES}`);
    }
    return validateProfile(args.profile);
}

/** Loads and validates a profile file at an absolute path (startup config, no local-mode guard). */
export function loadProfileFile(filePath: string): Profile {
    const spec: FileSpec = {
        arg: "PENPOT_MCP_JSX_PROFILE",
        maxBytes: MAX_PROFILE_BYTES,
        tooLarge: "PROFILE_INVALID",
        invalid: "PROFILE_INVALID",
    };
    const text = readText(resolveGuardedFile(undefined, filePath, spec), spec);
    return validateProfile(parseJsonText(text, spec.arg, "PROFILE_INVALID"));
}
