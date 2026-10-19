import { RUNTIME_SOURCE, RUNTIME_VERSION } from "@penpot/mcp-jsx";
import { ExecuteCodePluginTask } from "../tasks/ExecuteCodePluginTask";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import type { BudgetOp } from "./JsxConfig";
import { JsxToolError, KNOWN_ERROR_CODES, type ToolErrorCode } from "./results";

/**
 * Fragments of the error messages thrown by `PluginBridge.ts` (Penpot 2.18.0), copied here because the
 * bridge reports failures as plain `Error` text. `JsxRuntimeClient.test.ts` checks that each fragment is
 * still present in `PluginBridge.ts`, so a wording change upstream fails a test instead of silently
 * degrading the mapping.
 */
export const BRIDGE_ERROR_FRAGMENTS = {
    /** `getClientConnection`, single-user mode, nothing connected */
    noPluginConnected: "No Penpot plugin instances are currently connected",
    /** `PluginBridge.MULTIUSER_CONNECTION_ERROR_MESSAGE` (also Redis fail-fast) */
    noInstanceForToken: "No Penpot instance connected for user token",
    /** `dispatchForwardedTask` over Redis */
    notConnectedOnReceiver: "Plugin not connected on the receiving instance",
    /** `sendPluginTask`, socket not open */
    disconnected: "Plugin instance is disconnected",
    /** `assertPluginResponsive`, frozen tab */
    frozen: "has been frozen by the browser",
    /** `assertPluginResponsive`, stale heartbeat */
    suspended: "appears to be suspended by the browser",
    /** `getClientConnection`, several sockets in single-user mode */
    multiple: "Plugin instances are connected",
    /** `sendPluginTask` timeout: "Task <id> timed out after <n> seconds" */
    timeout: "timed out after",
} as const;

const TIMEOUT_HINT = "the plugin may still be working; call jsx_compare or jsx_pull later";

/** The reply envelope of the `executeCode` task that this client reads. */
export interface BridgeResult {
    data?: { result?: unknown; log?: string };
}

/**
 * Sends one task to the plugin and resolves with its result. Injected so the client is testable without a
 * WebSocket. `sessionId` is passed through for bridges that can route by it (Penpot 2.18.0 cannot: the
 * session is implicit via `getSessionContext()`).
 */
export type PluginTaskBridge = (task: ExecuteCodePluginTask, sessionId?: string) => Promise<BridgeResult>;

export interface CallOptions {
    sessionId?: string;
    /** time budget handed to the long ops; see `JsxConfig.budgetMs` */
    budgetMs: number;
}

export interface OpValue<T = unknown> {
    value: T;
    /** plugin-side duration reported by the runtime */
    ms: number;
}

export interface RuntimeClient {
    call<T = unknown>(op: BudgetOp, args: unknown, opts: CallOptions): Promise<OpValue<T>>;
}

/** Ops whose runtime implementation honours a `budgetMs` argument. */
const BUDGETED_OPS: ReadonlySet<BudgetOp> = new Set<BudgetOp>(["snapshot", "evaluate", "render", "read", "tokens"]);

interface OpFailure {
    ok: false;
    error: {
        code?: unknown;
        message?: unknown;
        line?: unknown;
        column?: unknown;
        path?: unknown;
        hint?: unknown;
        valid?: unknown;
    };
}

interface OpSuccess {
    ok: true;
    value: unknown;
    ms?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

/** Builds the guarded op body (design section 3). */
export function buildOpBody(op: BudgetOp, args: unknown, version: string = RUNTIME_VERSION): string {
    return (
        `const r = storage.__penpotJsx;\n` +
        `if (!r || r.version !== ${JSON.stringify(version)}) ` +
        `return { __jsx: "install-needed", have: r ? r.version : null };\n` +
        // args travel as a JSON string literal parsed in the plugin, so keys such as __proto__ stay own properties
        `return await r.op(${JSON.stringify(op)}, JSON.parse(${JSON.stringify(JSON.stringify(args ?? null))}));`
    );
}

/** Builds the install body (design section 3): the runtime IIFE, then its version. */
export function buildInstallBody(source: string = RUNTIME_SOURCE): string {
    return `${source}\n;return { installed: storage.__penpotJsx.version };`;
}

/** Maps a bridge `Error` to a tool code by its text; `undefined` when it is not a transport error. */
export function mapBridgeError(err: unknown): JsxToolError | undefined {
    const message = err instanceof Error ? err.message : String(err);
    const F = BRIDGE_ERROR_FRAGMENTS;
    const has = (fragment: string): boolean => message.includes(fragment);
    if (has(F.timeout)) {
        return new JsxToolError("PLUGIN_TIMEOUT", message, { hint: TIMEOUT_HINT });
    }
    if (has(F.multiple)) {
        return new JsxToolError("SESSION_AMBIGUOUS", message, {
            hint: "ask the user to keep a single Penpot MCP plugin connected",
        });
    }
    if (
        has(F.noPluginConnected) ||
        has(F.noInstanceForToken) ||
        has(F.notConnectedOnReceiver) ||
        has(F.disconnected) ||
        has(F.frozen) ||
        has(F.suspended)
    ) {
        return new JsxToolError("PLUGIN_NOT_CONNECTED", message, {
            hint: "ask the user to open the Penpot MCP plugin in the file and keep its tab focused",
        });
    }
    return undefined;
}

/**
 * Calls runtime ops in the plugin over the `executeCode` task: guarded op body, install on miss, one retry.
 *
 * There is deliberately no install cache: the guard in the op body is the source of truth, so a plugin
 * reload, a reconnect or an overwritten `storage.__penpotJsx` heals on the next call.
 */
export class JsxRuntimeClient implements RuntimeClient {
    constructor(
        private readonly bridge: PluginTaskBridge,
        private readonly runtime: { source: string; version: string } = {
            source: RUNTIME_SOURCE,
            version: RUNTIME_VERSION,
        }
    ) {}

    /** Wraps the server's plugin bridge. The 2.18.0 bridge has no session argument, so `sessionId` is dropped. */
    static forServer(server: Pick<PenpotMcpServer, "pluginBridge">): JsxRuntimeClient {
        return new JsxRuntimeClient((task) => server.pluginBridge.executePluginTask(task));
    }

    async call<T = unknown>(op: BudgetOp, args: unknown, opts: CallOptions): Promise<OpValue<T>> {
        const body = buildOpBody(op, this.withBudget(op, args, opts.budgetMs), this.runtime.version);

        let reply = await this.send(body, opts.sessionId);
        if (this.isInstallNeeded(reply)) {
            await this.ensureInstalled(opts.sessionId);
            reply = await this.send(body, opts.sessionId);
            if (this.isInstallNeeded(reply)) {
                throw new JsxToolError(
                    "RUNTIME_INSTALL_FAILED",
                    "the JSX runtime was installed but the plugin still reports it missing",
                    { hint: "another script may be overwriting storage.__penpotJsx; retry, or reload the plugin" }
                );
            }
        }
        return this.unwrap<T>(reply);
    }

    private withBudget(op: BudgetOp, args: unknown, budgetMs: number): unknown {
        if (!BUDGETED_OPS.has(op)) return args;
        return { ...(isRecord(args) ? args : {}), budgetMs };
    }

    private async send(code: string, sessionId: string | undefined): Promise<unknown> {
        let result: BridgeResult;
        try {
            result = await this.bridge(new ExecuteCodePluginTask({ code }), sessionId);
        } catch (e) {
            throw mapBridgeError(e) ?? this.pluginError(e);
        }
        return result.data?.result;
    }

    private pluginError(e: unknown): JsxToolError {
        return new JsxToolError("PLUGIN_ERROR", e instanceof Error ? e.message : String(e));
    }

    private isInstallNeeded(reply: unknown): boolean {
        return isRecord(reply) && reply.__jsx === "install-needed";
    }

    private installing: Promise<void> | undefined;

    /** Single-flight: concurrent calls that all missed share one install. */
    private ensureInstalled(sessionId: string | undefined): Promise<void> {
        if (this.installing === undefined) {
            this.installing = this.install(sessionId).finally(() => {
                this.installing = undefined;
            });
        }
        return this.installing;
    }

    private async install(sessionId: string | undefined): Promise<void> {
        let reply: unknown;
        try {
            reply = await this.send(buildInstallBody(this.runtime.source), sessionId);
        } catch (e) {
            // transport errors keep their own code; anything else is an install failure
            if (e instanceof JsxToolError && e.code !== "PLUGIN_ERROR") throw e;
            throw new JsxToolError(
                "RUNTIME_INSTALL_FAILED",
                `installing the JSX runtime failed: ${e instanceof Error ? e.message : String(e)}`
            );
        }
        const installed = isRecord(reply) ? reply.installed : undefined;
        if (installed !== this.runtime.version) {
            throw new JsxToolError(
                "RUNTIME_INSTALL_FAILED",
                `installed runtime version ${JSON.stringify(installed ?? null)} does not match ${this.runtime.version}`
            );
        }
    }

    private unwrap<T>(reply: unknown): OpValue<T> {
        if (!isRecord(reply) || typeof reply.ok !== "boolean") {
            throw new JsxToolError("PLUGIN_ERROR", "the plugin returned an unexpected reply for a JSX op");
        }
        if (reply.ok) {
            const success = reply as unknown as OpSuccess;
            return { value: success.value as T, ms: typeof success.ms === "number" ? success.ms : 0 };
        }
        const failure = reply as unknown as OpFailure;
        const e = isRecord(failure.error) ? failure.error : {};
        const code = (
            typeof e.code === "string" && KNOWN_ERROR_CODES.has(e.code) ? e.code : "PLUGIN_ERROR"
        ) as ToolErrorCode;
        const message = typeof e.message === "string" ? e.message : "the JSX runtime reported an error";
        const where: { line?: number; column?: number; path?: string; hint?: string; valid?: string[] } = {};
        if (Array.isArray(e.valid) && e.valid.every((v) => typeof v === "string")) where.valid = e.valid as string[];
        if (typeof e.line === "number") where.line = e.line;
        if (typeof e.column === "number") where.column = e.column;
        if (typeof e.path === "string") where.path = e.path;
        if (typeof e.hint === "string") where.hint = e.hint;
        throw new JsxToolError(code, message, where);
    }
}
