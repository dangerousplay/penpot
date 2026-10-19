import {
    LiveSnapshotSchema,
    RUNTIME_VERSION,
    buildRegistry,
    collectTags,
    compareScreen,
    compileMessages,
    describeComponents,
    isForbiddenPage,
    isJsxError,
    mergeGuards,
    prepareScreen,
    pullBoard,
    replay,
    resolveTag,
    scopeOf,
    themeFromTokens,
    transpile,
    type CompiledMessages,
    type Element,
    type LiveSnapshot,
    type Messages,
    type Profile,
    type RawBoard,
    type RScreen,
    type Registry,
    type ScreenNode,
    type Theme,
} from "@penpot/mcp-jsx";
import type { TextResponse } from "../ToolResponse";
import { createLogger } from "../logger";
import type { JsxConfig } from "./JsxConfig";
import type { RuntimeClient } from "./JsxRuntimeClient";
import { loadMessages, loadProfile, loadSource, type FsAccess } from "./inputs";
import { MAX_INLINE_JSX_BYTES, checkOutPath, writeOutput } from "./outputs";
import { JsxToolError, fail, ok, type ToolErrorCode } from "./results";

/** Hard ceiling for `maxScreens` (design section 9.2). */
export const MAX_SCREENS_CEILING = 24;
/** Settle-table entries older than this are forgotten (design section 9.4). */
export const SETTLE_TTL_MS = 10 * 60 * 1000;
/** Detail snapshots are fetched for every matched set only up to this many sets (design section 5). */
export const AUTO_DETAIL_SETS = 60;
/** Warnings listed in a result before the rest are replaced by a count (design section 8). */
export const MAX_RESULT_WARNINGS = 40;

/** Time source, injected so budgets and settle waits are testable without real delays. */
export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
}

export const SYSTEM_CLOCK: Clock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Remembers when each screen was last pushed by this server, per session (in memory, with a TTL). */
export class SettleTable {
    private readonly entries = new Map<string, number>();

    constructor(
        private readonly clock: Clock,
        private readonly ttlMs: number = SETTLE_TTL_MS
    ) {}

    mark(session: string, screenId: string): void {
        this.prune();
        this.entries.set(`${session}\u0000${screenId}`, this.clock.now());
    }

    /** Milliseconds since the last push of the screen, or `undefined` when unknown or expired. */
    since(session: string, screenId: string): number | undefined {
        this.prune();
        const at = this.entries.get(`${session}\u0000${screenId}`);
        return at === undefined ? undefined : this.clock.now() - at;
    }

    private prune(): void {
        const cutoff = this.clock.now() - this.ttlMs;
        for (const [key, at] of this.entries) if (at < cutoff) this.entries.delete(key);
    }
}

export interface JsxServiceDeps {
    client: RuntimeClient;
    config: JsxConfig;
    fs: FsAccess;
    /** identifies the caller for the settle table (never logged) */
    sessionKey?: () => string;
    clock?: Clock;
}

export interface AuthoringArgs {
    source?: string;
    sourcePath?: string;
    messages?: Record<string, unknown>;
    messagesPath?: string;
    locale?: string;
    strict?: boolean;
    page?: string;
    screens?: string[];
    profile?: unknown;
    maxScreens?: number;
}

export interface ComponentsArgs {
    filter?: string;
    detail?: boolean;
    libraries?: "local" | "all";
    profile?: unknown;
}

export interface PushArgs extends AuthoringArgs {
    dryRun?: boolean;
}

export interface CompareArgs extends AuthoringArgs {
    maxDiffs?: number;
}

export interface PullArgs {
    board?: string;
    screenId?: string;
    page?: string;
    messages?: Record<string, unknown>;
    messagesPath?: string;
    locale?: string;
    outPath?: string;
    profile?: unknown;
}

type Payload = Record<string, unknown>;

/** Everything one call needs after validation, evaluation and replay. */
interface Authored {
    profile: Profile | undefined;
    registry: Registry;
    theme: Theme;
    messages: CompiledMessages | undefined;
    locale: string;
    strict: boolean;
    page: string;
    guards: string[];
    ns: string | undefined;
    screens: ScreenNode[];
    warnings: string[];
    snapshot: LiveSnapshot;
}

/** Codes after which the remaining screens cannot succeed either: the loop stops and reports `pending`. */
const LOOP_ABORT_CODES: ReadonlySet<ToolErrorCode> = new Set<ToolErrorCode>([
    "PLUGIN_NOT_CONNECTED",
    "SESSION_AMBIGUOUS",
    "PLUGIN_TIMEOUT",
    "RUNTIME_INSTALL_FAILED",
]);

function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
}

function fileName(snap: LiveSnapshot): string | null {
    const f = snap.file;
    if (f === undefined || f === null) return null;
    return typeof f === "string" ? f : f.name;
}

function cappedWarnings(warnings: readonly string[]): Payload {
    const unique = [...new Set(warnings)];
    return unique.length > MAX_RESULT_WARNINGS
        ? { warnings: unique.slice(0, MAX_RESULT_WARNINGS), warningsCount: unique.length }
        : { warnings: unique };
}

function toolError(e: unknown): JsxToolError | undefined {
    if (e instanceof JsxToolError) return e;
    if (isJsxError(e)) return new JsxToolError(e.code, e.message, e.toJSON());
    return undefined;
}

/** Wraps an unexpected error as an agent-facing `INTERNAL` entry; the detail goes to the log only. */
function internalError(e: unknown, logger: { error(message: string): void }): JsxToolError {
    logger.error(`unexpected error in a JSX loop: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return new JsxToolError("INTERNAL", "unexpected server error while processing this screen", {
        hint: "the remaining screens are in pending; retry, and report this if it repeats",
    });
}

/** Runs a service method and turns expected failures into a `{ok: false}` result; others propagate. */
export async function respond(run: () => Promise<Payload>): Promise<TextResponse> {
    try {
        return ok(await run());
    } catch (e) {
        const expected = toolError(e);
        if (expected === undefined) throw e;
        return fail(expected);
    }
}

function matcher(filter: string | undefined): (tag: string, set: string) => boolean {
    if (filter === undefined || filter === "") return () => true;
    if (/[*?]/.test(filter)) {
        const escaped = filter
            .replace(/[\\^$.+()|{}[\]]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
        const re = new RegExp(`^${escaped}$`, "i");
        return (tag, set) => re.test(tag) || re.test(set);
    }
    const needle = filter.toLowerCase();
    return (tag, set) => tag.toLowerCase().includes(needle) || set.toLowerCase().includes(needle);
}

function copySets(node: unknown, into: Set<string>): void {
    if (typeof node !== "object" || node === null) return;
    const n = node as { t?: unknown; set?: unknown; children?: unknown };
    if (n.t === "copy" && typeof n.set === "string") into.add(n.set);
    if (Array.isArray(n.children)) for (const c of n.children) copySets(c, into);
}

/**
 * The pipelines of design section 1 (components, push, pull, compare) over a {@link RuntimeClient}.
 * No WebSocket and no user-code evaluation here: the plugin runtime evaluates, this class validates and prepares.
 */
export class JsxService {
    private readonly logger = createLogger("Jsx");
    private readonly clock: Clock;
    readonly settle: SettleTable;

    constructor(private readonly deps: JsxServiceDeps) {
        this.clock = deps.clock ?? SYSTEM_CLOCK;
        this.settle = new SettleTable(this.clock);
    }

    // ── jsx_components ────────────────────────────────────────────────────────────────

    async components(args: ComponentsArgs): Promise<Payload> {
        const t0 = this.clock.now();
        const profile = this.profileOf(args.profile);
        const libraries = args.libraries ?? "all";
        let snap = await this.snapshot({ libraries, tokens: true });
        let registry = buildRegistry(snap, profile);
        const theme = themeFromTokens(snap.tokens ?? { sets: [], themes: [] }, profile);

        const matches = matcher(args.filter);
        const picked = Object.values(registry.components).filter((c) => matches(c.tag, c.set));
        const wantDetail = args.detail ?? picked.length <= AUTO_DETAIL_SETS;
        if (wantDetail && picked.length > 0) {
            const detail = await this.snapshot({ libraries, tokens: false, detailSets: picked.map((c) => c.set) });
            snap = { ...detail, tokens: snap.tokens };
            registry = buildRegistry(snap, profile);
        }

        const file = fileName(snap);
        const signatures = describeComponents(registry, theme, {
            ...(args.filter !== undefined ? { filter: args.filter } : {}),
            detail: wantDetail,
            ...(file !== null ? { file } : {}),
            penpotVersion: snap.penpotVersion,
        });
        return {
            ...this.envelope(snap, t0),
            signatures,
            count: picked.length,
            theme: {
                colors: Object.keys(theme.colors).length,
                spacing: Object.keys(theme.spacing).length,
                radius: Object.keys(theme.radius).length,
                shadow: Object.keys(theme.shadow).length,
            },
            ...cappedWarnings(registry.warnings),
        };
    }

    // ── jsx_push ──────────────────────────────────────────────────────────────────────

    async push(args: PushArgs): Promise<Payload> {
        const t0 = this.clock.now();
        const a = await this.author(args, t0, true);
        const selected = this.select(a.screens, args.screens);

        // validate and prepare every screen before the first write
        const prepared: { screen: RScreen; warnings: string[] }[] = selected.map((s, i) => {
            const warnings: string[] = [];
            try {
                const screen = prepareScreen(s, {
                    registry: a.registry,
                    theme: a.theme,
                    locale: a.locale,
                    strict: a.strict,
                    warnings,
                    ...(a.messages !== undefined ? { messages: a.messages } : {}),
                });
                return { screen, warnings };
            } catch (e) {
                const err = toolError(e);
                if (err !== undefined && err.path === undefined) err.path = `screens[${i}] (${s.id})`;
                throw err ?? e;
            }
        });

        const results: Payload[] = [];
        if (args.dryRun === true) {
            for (const p of prepared) {
                results.push({ screenId: p.screen.id, status: "validated", ...this.screenWarnings(p.warnings) });
            }
            return {
                ...this.envelope(a.snapshot, t0),
                page: a.page,
                results,
                pending: [],
                ...cappedWarnings(a.warnings),
            };
        }

        const session = this.session();
        const maxScreens = Math.min(args.maxScreens ?? this.deps.config.maxScreens, MAX_SCREENS_CEILING);
        const durations: number[] = [];
        const pending: string[] = [];
        let attempted = 0;
        let aborted = false;
        for (const p of prepared) {
            if (aborted || attempted >= maxScreens || this.overBudget(t0, durations, 0)) {
                pending.push(p.screen.id);
                continue;
            }
            attempted++;
            const started = this.clock.now();
            try {
                const call = await this.deps.client.call<{ boardId?: string; nodes?: number; warnings?: string[] }>(
                    "render",
                    {
                        screen: p.screen,
                        opts: { page: a.page },
                        guards: a.guards,
                        defaultPage: a.page,
                        ...(a.ns !== undefined ? { ns: a.ns } : {}),
                    },
                    { budgetMs: this.deps.config.budgetMs("render") }
                );
                this.settle.mark(session, p.screen.id);
                this.log("render", p.screen.id, this.clock.now() - started);
                results.push({
                    screenId: p.screen.id,
                    // SPEC_DEVIATION: the runtime summary does not say whether the board was replaced,
                    // so the status is "rendered" instead of "created" | "replaced"
                    status: "rendered",
                    ...(call.value.boardId !== undefined ? { boardId: call.value.boardId } : {}),
                    ms: call.ms,
                    ...this.screenWarnings([...p.warnings, ...(call.value.warnings ?? [])]),
                });
            } catch (e) {
                // an unexpected error must not discard the screens already rendered: report it and stop
                const err = toolError(e) ?? internalError(e, this.logger);
                // a timed-out render may still finish in the plugin (its mutex keeps ops ordered), so a
                // following compare must settle as if the screen had been pushed
                if (err.code === "PLUGIN_TIMEOUT") this.settle.mark(session, p.screen.id);
                results.push({ screenId: p.screen.id, status: "error", error: err.toJSON() });
                if (LOOP_ABORT_CODES.has(err.code) || err.code === "INTERNAL") aborted = true;
            }
            durations.push(this.clock.now() - started);
        }

        return {
            ...this.envelope(a.snapshot, t0),
            page: a.page,
            results,
            pending,
            ...cappedWarnings(a.warnings),
        };
    }

    // ── jsx_compare ───────────────────────────────────────────────────────────────────

    async compare(args: CompareArgs): Promise<Payload> {
        const t0 = this.clock.now();
        const a = await this.author(args, t0, false);
        const selected = this.select(a.screens, args.screens);
        const maxDiffs = args.maxDiffs ?? 50;
        const session = this.session();
        const maxScreens = Math.min(args.maxScreens ?? this.deps.config.maxScreens, MAX_SCREENS_CEILING);
        const pullCtx = {
            registry: a.registry,
            theme: a.theme,
            locale: a.locale,
            ...(a.messages !== undefined ? { messages: a.messages } : {}),
            ...(a.profile !== undefined ? { profile: a.profile } : {}),
        };

        const screens: Payload[] = [];
        const pending: string[] = [];
        const durations: number[] = [];
        let attempted = 0;
        let aborted = false;
        for (const authored of selected) {
            const sinceMs = this.settle.since(session, authored.id);
            const wait = sinceMs === undefined ? 0 : Math.max(0, this.deps.config.settleMs - sinceMs);
            if (aborted || attempted >= maxScreens || this.overBudget(t0, durations, wait)) {
                pending.push(authored.id);
                continue;
            }
            attempted++;
            const started = this.clock.now();
            try {
                if (wait > 0) await this.clock.sleep(wait);
                const read = await this.deps.client.call<RawBoard>(
                    "read",
                    { query: { board: authored.id, page: a.page }, ...(a.ns !== undefined ? { ns: a.ns } : {}) },
                    { budgetMs: this.deps.config.budgetMs("read") }
                );
                this.log("read", authored.id, this.clock.now() - started);
                const cmp = compareScreen(authored, read.value, pullCtx);
                screens.push({
                    screenId: authored.id,
                    equal: cmp.equal,
                    diffs: cmp.diffs.slice(0, maxDiffs),
                    diffCount: cmp.diffs.length,
                    ...(cmp.copyDrift.length > 0 ? { copyDrift: cmp.copyDrift.slice(0, MAX_RESULT_WARNINGS) } : {}),
                });
            } catch (e) {
                const err = toolError(e) ?? internalError(e, this.logger);
                screens.push({ screenId: authored.id, equal: false, diffs: [], diffCount: 0, error: err.toJSON() });
                if (LOOP_ABORT_CODES.has(err.code) || err.code === "INTERNAL") aborted = true;
            }
            durations.push(this.clock.now() - started);
        }
        return { ...this.envelope(a.snapshot, t0), page: a.page, screens, pending, ...cappedWarnings(a.warnings) };
    }

    // ── jsx_pull ──────────────────────────────────────────────────────────────────────

    async pull(args: PullArgs): Promise<Payload> {
        const t0 = this.clock.now();
        const board = args.board ?? args.screenId;
        if (board === undefined || board === "") {
            // SPEC_DEVIATION: the vendored runtime `read` op cannot resolve the current selection
            throw new JsxToolError("INVALID_ARGS", "pass board (name or id) or screenId", {
                hint: "selection fallback is not available in this runtime version",
            });
        }
        // validated before any runtime call, so a bad outPath costs nothing
        if (args.outPath !== undefined) checkOutPath(args.outPath, this.deps.fs);
        const profile = this.profileOf(args.profile);
        const rawMessages = loadMessages(args, this.deps.fs);
        const messages = rawMessages === undefined ? undefined : compileMessages(rawMessages as Messages);
        const locale = args.locale ?? "en";
        const ns = profile?.sharedNs;

        const read = await this.deps.client.call<RawBoard>(
            "read",
            {
                query: { board, ...(args.page !== undefined ? { page: args.page } : {}) },
                ...(ns !== undefined ? { ns } : {}),
            },
            { budgetMs: this.deps.config.budgetMs("read") }
        );
        const raw = read.value;
        const sets = new Set<string>();
        for (const child of raw.children) copySets(child, sets);
        const snap = await this.snapshot({ libraries: "all", tokens: true, detailSets: [...sets] });
        const registry = buildRegistry(snap, profile);
        const theme = themeFromTokens(snap.tokens ?? { sets: [], themes: [] }, profile);
        const pulled = pullBoard(raw, {
            registry,
            theme,
            locale,
            ...(messages !== undefined ? { messages } : {}),
            ...(profile !== undefined ? { profile } : {}),
        });

        const bytes = Buffer.byteLength(pulled.jsx, "utf8");
        const out: Payload = {
            ...this.envelope(snap, t0),
            board: {
                id: raw.boardId,
                name: raw.name,
                page: raw.page,
                ...(raw.screenId !== undefined ? { screenId: raw.screenId } : {}),
            },
            bytes,
            ...cappedWarnings(pulled.warnings),
            copyDrift: pulled.copyDrift.slice(0, MAX_RESULT_WARNINGS),
        };
        if (pulled.copyDrift.length > MAX_RESULT_WARNINGS) out.copyDriftCount = pulled.copyDrift.length;
        if (args.outPath !== undefined) {
            writeOutput(args.outPath, pulled.jsx, this.deps.fs);
            out.outPath = args.outPath;
        } else if (bytes > MAX_INLINE_JSX_BYTES) {
            throw new JsxToolError(
                "RESULT_TOO_LARGE",
                `the pulled source is ${bytes} bytes; the inline cap is ${MAX_INLINE_JSX_BYTES}`,
                { hint: "pass outPath (local mode) to write it to a file" }
            );
        } else {
            out.jsx = pulled.jsx;
        }
        return out;
    }

    // ── shared steps ──────────────────────────────────────────────────────────────────

    /**
     * Validate inputs, transpile, snapshot, evaluate, snapshot the used sets, replay. Makes no write.
     * `forWrite` also refuses forbidden target pages, before any runtime call.
     */
    private async author(args: AuthoringArgs, t0: number, forWrite: boolean): Promise<Authored> {
        const { config } = this.deps;
        // 1. inputs: everything that can fail without the plugin fails first
        const source = loadSource(args, this.deps.fs);
        const rawMessages = loadMessages(args, this.deps.fs);
        const argProfile = loadProfile(args);
        const profile = argProfile ?? config.profile;
        const messages = rawMessages === undefined ? undefined : compileMessages(rawMessages as Messages);
        const page = args.page ?? profile?.defaultPage ?? config.defaultPage;
        const guards = mergeGuards(argProfile, config.forbiddenPages);
        if (forWrite && isForbiddenPage(page, guards)) {
            throw new JsxToolError("PAGE_FORBIDDEN", `page "${page}" is protected and cannot be written`, {
                hint: "choose another page",
            });
        }
        const { code } = transpile(source, {
            ...(profile?.importAliases !== undefined ? { importAliases: profile.importAliases } : {}),
        });

        // 2. light snapshot, then evaluate in the plugin sandbox
        const light = await this.snapshot({ libraries: "all", tokens: true });
        const lightRegistry = buildRegistry(light, profile);
        const evaluated = await this.deps.client.call<{ screens: Element[]; warnings?: string[] }>(
            "evaluate",
            { code, scope: scopeOf(lightRegistry, profile) },
            { budgetMs: config.budgetMs("evaluate") }
        );
        const elements = evaluated.value.screens;
        const theme = themeFromTokens(light.tokens ?? { sets: [], themes: [] }, profile);
        const locale = args.locale ?? "en";
        const strict = args.strict === true;
        const init = {
            theme,
            locale,
            strict,
            ...(messages !== undefined ? { messages } : {}),
            ...(profile !== undefined ? { profile } : {}),
        };

        // 3. unknown / ambiguous tags: replay on the light registry reports them with line and path
        const used = new Set<string>();
        let unresolved: unknown;
        for (const tag of collectTags(elements)) {
            try {
                used.add(resolveTag(lightRegistry, tag).set);
            } catch (e) {
                unresolved ??= e;
            }
        }
        if (unresolved !== undefined) {
            replay(elements, { ...init, registry: lightRegistry });
            throw unresolved;
        }

        // 4. detail snapshot for the used sets only
        let snapshot = light;
        let registry = lightRegistry;
        if (used.size > 0) {
            const detail = await this.snapshot({ libraries: "all", tokens: false, detailSets: [...used] });
            snapshot = { ...detail, tokens: light.tokens };
            registry = buildRegistry(snapshot, profile);
        }

        // 5. replay validates tags, props, variants, slots and copy, and runs no user code
        const replayed = replay(elements, { ...init, registry });
        this.log("authored", `${replayed.screens.length} screen(s)`, this.clock.now() - t0);
        return {
            profile,
            registry,
            theme,
            messages,
            locale,
            strict,
            page,
            guards,
            ns: profile?.sharedNs,
            screens: replayed.screens,
            warnings: [...(evaluated.value.warnings ?? []), ...replayed.warnings],
            snapshot,
        };
    }

    private select(screens: ScreenNode[], wanted: string[] | undefined): ScreenNode[] {
        if (wanted === undefined) return screens;
        const known = new Set(screens.map((s) => s.id));
        const missing = wanted.filter((id) => !known.has(id));
        if (missing.length > 0) {
            throw new JsxToolError("INVALID_ARGS", `unknown screen ids: ${missing.join(", ")}`, {
                valid: [...known],
            });
        }
        const keep = new Set(wanted);
        return screens.filter((s) => keep.has(s.id));
    }

    /** True when starting another unit of work (plus `extraMs`) would pass the call budget. */
    private overBudget(t0: number, durations: readonly number[], extraMs: number): boolean {
        return this.clock.now() - t0 + median(durations) + extraMs > this.deps.config.callBudgetMs;
    }

    private async snapshot(opts: {
        libraries: "local" | "all";
        tokens: boolean;
        detailSets?: string[];
    }): Promise<LiveSnapshot> {
        const started = this.clock.now();
        const reply = await this.deps.client.call("snapshot", opts, {
            budgetMs: this.deps.config.budgetMs("snapshot"),
        });
        const what = opts.detailSets === undefined ? "light" : `detail(${opts.detailSets.length})`;
        this.log("snapshot", what, this.clock.now() - started);
        const parsed = LiveSnapshotSchema.safeParse(reply.value);
        if (!parsed.success) {
            throw new JsxToolError("SNAPSHOT_INVALID", "the plugin returned a snapshot of an unexpected shape");
        }
        return parsed.data;
    }

    private profileOf(raw: unknown): Profile | undefined {
        return loadProfile({ profile: raw }) ?? this.deps.config.profile;
    }

    private session(): string {
        return this.deps.sessionKey?.() ?? "local";
    }

    private screenWarnings(warnings: readonly string[]): Payload {
        const unique = [...new Set(warnings)];
        return unique.length === 0 ? {} : { warnings: unique.slice(0, MAX_RESULT_WARNINGS) };
    }

    private envelope(snap: LiveSnapshot, t0: number): Payload {
        return {
            ms: this.clock.now() - t0,
            runtimeVersion: RUNTIME_VERSION,
            penpotVersion: snap.penpotVersion,
            file: fileName(snap),
        };
    }

    private log(op: string, what: string, ms: number): void {
        this.logger.info(`op=${op} ${what} ms=${ms} runtime=${RUNTIME_VERSION}`);
    }
}
