import * as path from "path";
import { mergeGuards, type Profile } from "@penpot/mcp-jsx";
import { loadProfileFile } from "./inputs";

/** Plugin ops that carry a time budget (design section 11). */
export type BudgetOp = "ping" | "snapshot" | "evaluate" | "render" | "read" | "tokens";

/** Default per-op budgets in ms, before the task-timeout clamp (design section 11). */
export const OP_DEFAULT_BUDGET_MS: Readonly<Record<BudgetOp, number>> = {
    ping: 10_000,
    snapshot: 30_000,
    evaluate: 10_000,
    render: 80_000,
    read: 30_000,
    tokens: 60_000,
};

/** Penpot must give up first: the margin kept between the op budget and the task timeout. */
export const BUDGET_MARGIN_MS = 15_000;
/** Below this task timeout (seconds) the tools refuse to start. */
export const MIN_TOOL_TIMEOUT_S = 30;
/** Below this effective budget (ms) the render budget shrinks from its default; only logged. */
const SHRINK_NOTICE_MS = 80_000;

export const DEFAULT_PAGE_FALLBACK = "JSX Drafts";

export interface JsxLog {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface JsxConfig {
    enabled: boolean;
    /** why the tools are disabled; set only when `enabled` is false */
    disabledReason?: string;
    /** PENPOT_MCP_TOOL_TIMEOUT_S */
    toolTimeoutS: number;
    /** wall-clock budget per tool call, in ms */
    callBudgetMs: number;
    maxScreens: number;
    settleMs: number;
    /** push target when `page` is omitted */
    defaultPage: string;
    /** env guards unioned with the profile's `forbiddenPages` */
    forbiddenPages: string[];
    /** PENPOT_MCP_JSX_FS_ROOTS: allowlist for *Path arguments; empty means unrestricted (local mode) */
    fsRoots: string[];
    profile?: Profile;
    /** min(op default, T*1000 - 15000), never below 1000 */
    budgetMs(op: BudgetOp): number;
}

type Env = Readonly<Record<string, string | undefined>>;

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined || raw.trim() === "") return fallback;
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return fallback;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number, log: JsxLog): number {
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        log.warn(`${name}="${raw}" is not a positive integer; using ${fallback}`);
        return fallback;
    }
    return n;
}

/** Budget arithmetic of design section 11, exposed for tests. */
export function computeBudgetMs(op: BudgetOp, toolTimeoutS: number): number {
    const ceiling = toolTimeoutS * 1000 - BUDGET_MARGIN_MS;
    return Math.max(1000, Math.min(OP_DEFAULT_BUDGET_MS[op], ceiling));
}

/**
 * Parses the `PENPOT_MCP_JSX_*` variables plus `PENPOT_MCP_TOOL_TIMEOUT_S` (design section 12).
 *
 * @throws JsxToolError `PROFILE_INVALID` when `PENPOT_MCP_JSX_PROFILE` is set but unreadable or invalid
 *   (fail fast at startup). A task timeout below 30 s does not throw: it returns `enabled: false` and logs.
 */
export function loadJsxConfig(env: Env, log: JsxLog): JsxConfig {
    // same parseInt as PenpotMcpServer, so both sides agree on T
    let toolTimeoutS = parseInt(env.PENPOT_MCP_TOOL_TIMEOUT_S ?? "120", 10);
    if (!Number.isInteger(toolTimeoutS) || toolTimeoutS <= 0) {
        log.warn(`PENPOT_MCP_TOOL_TIMEOUT_S="${env.PENPOT_MCP_TOOL_TIMEOUT_S}" is not a positive integer; using 120`);
        toolTimeoutS = 120;
    }
    const callBudgetS = parsePositiveInt("PENPOT_MCP_JSX_CALL_BUDGET_S", env.PENPOT_MCP_JSX_CALL_BUDGET_S, 300, log);
    const maxScreens = parsePositiveInt("PENPOT_MCP_JSX_MAX_SCREENS", env.PENPOT_MCP_JSX_MAX_SCREENS, 12, log);
    const settleMs = parsePositiveInt("PENPOT_MCP_JSX_SETTLE_MS", env.PENPOT_MCP_JSX_SETTLE_MS, 2000, log);

    let enabled = parseBool(env.PENPOT_MCP_JSX_ENABLE, true);
    let disabledReason: string | undefined;
    if (!enabled) {
        disabledReason = "PENPOT_MCP_JSX_ENABLE is false";
    } else if (toolTimeoutS < MIN_TOOL_TIMEOUT_S) {
        enabled = false;
        disabledReason =
            `PENPOT_MCP_TOOL_TIMEOUT_S=${toolTimeoutS} is below ${MIN_TOOL_TIMEOUT_S}; ` +
            `the JSX tools need at least ${MIN_TOOL_TIMEOUT_S} s per plugin task`;
        log.error(`JSX tools disabled: ${disabledReason}`);
    } else if (toolTimeoutS * 1000 - BUDGET_MARGIN_MS < SHRINK_NOTICE_MS) {
        log.info(
            `PENPOT_MCP_TOOL_TIMEOUT_S=${toolTimeoutS}: JSX op budgets shrink to ` +
                `${toolTimeoutS * 1000 - BUDGET_MARGIN_MS} ms where they would exceed it`
        );
    }

    let profile: Profile | undefined;
    const profilePath = env.PENPOT_MCP_JSX_PROFILE?.trim();
    if (enabled && profilePath) {
        profile = loadProfileFile(profilePath);
    }

    const envGuards = (env.PENPOT_MCP_JSX_FORBIDDEN_PAGES ?? "")
        .split(";")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

    const envDefaultPage = env.PENPOT_MCP_JSX_DEFAULT_PAGE?.trim();
    const defaultPage = envDefaultPage || profile?.defaultPage || DEFAULT_PAGE_FALLBACK;

    const config: JsxConfig = {
        enabled,
        toolTimeoutS,
        callBudgetMs: callBudgetS * 1000,
        maxScreens,
        settleMs,
        defaultPage,
        forbiddenPages: mergeGuards(profile, envGuards),
        fsRoots: (env.PENPOT_MCP_JSX_FS_ROOTS ?? "")
            .split(path.delimiter)
            .map((r) => r.trim())
            .filter((r) => r.length > 0),
        budgetMs: (op) => computeBudgetMs(op, toolTimeoutS),
    };
    if (disabledReason !== undefined) config.disabledReason = disabledReason;
    if (profile !== undefined) config.profile = profile;
    return config;
}
