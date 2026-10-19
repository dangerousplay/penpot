import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Element, RawBoard } from "@penpot/mcp-jsx";
import { loadJsxConfig, type BudgetOp, type JsxConfig } from "./JsxConfig";
import type { CallOptions, OpValue, RuntimeClient } from "./JsxRuntimeClient";
import { JsxService, respond, type Clock, type JsxServiceDeps } from "./JsxService";
import { GENERATED_HEADER } from "./outputs";
import { JsxToolError } from "./results";
import type { FsAccess } from "./inputs";

const FIXTURE = fileURLToPath(new URL("../../../jsx/src/fixtures/generic-snapshot.json", import.meta.url));
const SNAPSHOT: unknown = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

const SOURCE = "export default null;";

function screen(id: string, children: Element[] = []): Element {
    return { $: "Screen", p: { id, platform: "ios", title: id }, c: children };
}

function button(label = "Go"): Element {
    return { $: "Button", p: { style: "Ghost", size: "MD", label }, c: [] };
}

class FakeClock implements Clock {
    time = 1_000_000;
    sleeps: number[] = [];
    now(): number {
        return this.time;
    }
    async sleep(ms: number): Promise<void> {
        this.sleeps.push(ms);
        this.time += ms;
    }
}

interface Call {
    op: BudgetOp;
    args: Record<string, unknown>;
}

/** Replays recorded op results: the generic fixture snapshot plus a programmable element tree. */
class FakeClient implements RuntimeClient {
    calls: Call[] = [];
    elements: Element[] = [screen("home", [button()])];
    /** screen ids whose render fails with this tool error */
    renderFails = new Map<string, JsxToolError>();
    /** fake clock advance per render, in ms */
    renderMs = 0;
    board: RawBoard = {
        boardId: "board-1",
        page: "Home",
        name: "iOS · Home",
        screenId: "home",
        platform: "ios",
        w: 393,
        h: 852,
        children: [],
    };

    constructor(private readonly clock: FakeClock) {}

    count(op: BudgetOp): number {
        return this.calls.filter((c) => c.op === op).length;
    }

    async call<T = unknown>(op: BudgetOp, args: unknown, _opts: CallOptions): Promise<OpValue<T>> {
        const a = args as Record<string, unknown>;
        this.calls.push({ op, args: a });
        switch (op) {
            case "snapshot":
                return { value: SNAPSHOT as T, ms: 1 };
            case "evaluate":
                return { value: { screens: this.elements, warnings: [] } as T, ms: 1 };
            case "render": {
                const id = (a.screen as { id: string }).id;
                const failure = this.renderFails.get(id);
                if (failure !== undefined) throw failure;
                this.clock.time += this.renderMs;
                return { value: { screenId: id, boardId: `b-${id}`, nodes: 3, ms: 1, warnings: [] } as T, ms: 5 };
            }
            case "read":
                return { value: this.board as T, ms: 1 };
            default:
                return { value: { version: "x" } as T, ms: 0 };
        }
    }
}

function config(over: Partial<JsxConfig> = {}): JsxConfig {
    const quiet = { info() {}, warn() {}, error() {} };
    return { ...loadJsxConfig({}, quiet), ...over };
}

function setup(over: Partial<JsxConfig> = {}, fsAccess?: Partial<FsAccess>) {
    const clock = new FakeClock();
    const client = new FakeClient(clock);
    const deps: JsxServiceDeps = {
        client,
        config: config(over),
        fs: { isFileSystemAccessEnabled: () => true, ...fsAccess },
        clock,
    };
    return { clock, client, service: new JsxService(deps) };
}

type Results = { screenId: string; status: string; error?: { code: string } }[];

test("push of 3 screens where 1 fails: the loop continues and reports each", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()]), screen("c", [button()])];
    client.renderFails.set("b", new JsxToolError("BUDGET_EXCEEDED", "render exceeded its budget"));

    const out = await service.push({ source: SOURCE });
    const results = out.results as Results;
    assert.deepEqual(
        results.map((r) => [r.screenId, r.status]),
        [
            ["a", "rendered"],
            ["b", "error"],
            ["c", "rendered"],
        ]
    );
    assert.equal(results[1]!.error?.code, "BUDGET_EXCEEDED");
    assert.deepEqual(out.pending, []);
    assert.equal(client.count("render"), 3);
    assert.equal(out.page, "JSX Drafts");
    assert.equal(out.penpotVersion, "2.18.0");
    assert.equal(out.file, "Acme App");
});

test("a transport failure stops the loop and the rest comes back as pending", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()]), screen("c", [button()])];
    client.renderFails.set("a", new JsxToolError("PLUGIN_NOT_CONNECTED", "no plugin"));

    const out = await service.push({ source: SOURCE });
    assert.deepEqual(
        (out.results as Results).map((r) => r.status),
        ["error"]
    );
    assert.deepEqual(out.pending, ["b", "c"]);
});

test("a forbidden page is refused before any runtime call", async () => {
    const { client, service } = setup({ forbiddenPages: ["Locked Page"] });
    await assert.rejects(
        () => service.push({ source: SOURCE, page: "  locked   PAGE " }),
        (e: unknown) => e instanceof JsxToolError && e.code === "PAGE_FORBIDDEN"
    );
    assert.equal(client.calls.length, 0);
});

test("a forbidden default page is refused too, and a profile argument adds guards", async () => {
    const { client, service } = setup({ defaultPage: "Frozen", forbiddenPages: ["Frozen"] });
    await assert.rejects(() => service.push({ source: SOURCE }), /protected/);
    const second = setup();
    await assert.rejects(
        () => second.service.push({ source: SOURCE, page: "Mine", profile: { forbiddenPages: ["mine"] } }),
        /protected/
    );
    assert.equal(client.calls.length + second.client.calls.length, 0);
});

test("pending when the call budget is exhausted (fake clock)", async () => {
    const { client, service } = setup({ callBudgetMs: 100_000 });
    client.renderMs = 40_000;
    client.elements = [screen("a", [button()]), screen("b", [button()]), screen("c", [button()])];

    const out = await service.push({ source: SOURCE });
    assert.deepEqual(
        (out.results as Results).map((r) => r.screenId),
        ["a", "b"]
    );
    assert.deepEqual(out.pending, ["c"]);
    assert.equal(client.count("render"), 2);
});

test("pending when maxScreens is reached", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()]), screen("c", [button()])];

    const out = await service.push({ source: SOURCE, maxScreens: 2 });
    assert.equal((out.results as Results).length, 2);
    assert.deepEqual(out.pending, ["c"]);
});

test("screens selects a subset and rejects unknown ids before any render", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()])];

    const out = await service.push({ source: SOURCE, screens: ["b"] });
    assert.deepEqual(
        (out.results as Results).map((r) => r.screenId),
        ["b"]
    );
    await assert.rejects(
        () => service.push({ source: SOURCE, screens: ["zzz"] }),
        (e: unknown) => e instanceof JsxToolError && e.code === "INVALID_ARGS" && e.valid?.join() === "a,b"
    );
    assert.equal(client.count("render"), 1);
});

test("unknown tags fail with a suggestion, a line and no detail snapshot or render", async () => {
    const { client, service } = setup();
    client.elements = [screen("home", [{ $: "Buton", p: {}, c: [], l: 7 }])];

    await assert.rejects(
        () => service.push({ source: SOURCE }),
        (e: unknown) =>
            e instanceof Error &&
            (e as JsxToolError).code === "JSX_UNKNOWN_COMPONENT" &&
            e.message.includes("Did you mean <Button>?") &&
            (e as JsxToolError).line === 7
    );
    assert.equal(client.count("render"), 0);
    assert.equal(client.count("snapshot"), 1);
});

test("respond turns expected errors into a compact {ok: false} result", async () => {
    const { service } = setup();
    const res = await respond(() => service.push({ source: SOURCE, page: "x", profile: { nope: true } }));
    const body = JSON.parse(res.content[0]!.type === "text" ? (res.content[0] as { text: string }).text : "");
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "PROFILE_INVALID");
});

test("dryRun validates and prepares but never calls render", async () => {
    const { client, service } = setup();
    const out = await service.push({ source: SOURCE, dryRun: true });
    assert.deepEqual(
        (out.results as Results).map((r) => [r.screenId, r.status]),
        [["home", "validated"]]
    );
    assert.equal(client.count("render"), 0);
    assert.equal(client.count("evaluate"), 1);
});

test("push fetches a detail snapshot only for the used sets", async () => {
    const { client, service } = setup();
    await service.push({ source: SOURCE, dryRun: true });
    const snaps = client.calls.filter((c) => c.op === "snapshot");
    assert.equal(snaps.length, 2);
    assert.equal(snaps[0]!.args.detailSets, undefined);
    assert.deepEqual(snaps[1]!.args.detailSets, ["Button"]);
});

test("compare waits for the settle after a push (fake clock)", async () => {
    const { clock, client, service } = setup({ settleMs: 2000 });
    await service.push({ source: SOURCE });
    assert.deepEqual(clock.sleeps, []);

    clock.time += 500; // 500 ms passed since the push: 1500 ms are left
    const out = await service.compare({ source: SOURCE });
    assert.deepEqual(clock.sleeps, [1500]);
    const screens = out.screens as { screenId: string; diffCount: number }[];
    assert.equal(screens[0]!.screenId, "home");
    assert.equal(typeof screens[0]!.diffCount, "number");
    assert.equal(client.count("read"), 1);
    assert.deepEqual(out.pending, []);
});

test("compare does not wait for a screen this server never pushed, nor after the TTL", async () => {
    const { clock, service } = setup();
    await service.compare({ source: SOURCE });
    assert.deepEqual(clock.sleeps, []);

    await service.push({ source: SOURCE });
    clock.time += 11 * 60 * 1000;
    await service.compare({ source: SOURCE });
    assert.deepEqual(clock.sleeps, []);
});

test("compare reports a missing board per screen and keeps going", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()])];
    const original = client.call.bind(client);
    client.call = async (op, args, opts) => {
        if (op === "read" && (args as { query: { board: string } }).query.board === "a") {
            throw new JsxToolError("BOARD_NOT_FOUND", 'no board "a"');
        }
        return original(op, args, opts);
    };
    const out = await service.compare({ source: SOURCE });
    const screens = out.screens as { screenId: string; equal: boolean; error?: { code: string } }[];
    assert.equal(screens[0]!.error?.code, "BOARD_NOT_FOUND");
    assert.equal(screens[1]!.screenId, "b");
});

test("components returns signatures, counts and the theme sizes", async () => {
    const { client, service } = setup();
    const out = await service.components({ filter: "button" });
    assert.equal(out.count, 1);
    assert.match(out.signatures as string, /Button \{ style\?: "Primary"/);
    assert.deepEqual(Object.keys(out.theme as object), ["colors", "spacing", "radius", "shadow"]);
    assert.equal(client.count("snapshot"), 2);
});

test("components with detail=false makes one snapshot call", async () => {
    const { client, service } = setup();
    await service.components({ detail: false });
    assert.equal(client.count("snapshot"), 1);
});

test("pull writes outPath under fsRoots, then overwrites it because of the generated header", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-pull-"));
    try {
        const { client, service } = setup({}, { fsRoots: [dir] });
        const outPath = path.join(dir, "home.tsx");
        const out = await service.pull({ board: "home", outPath });
        assert.equal(out.jsx, undefined);
        assert.equal(out.outPath, outPath);
        const text = fs.readFileSync(outPath, "utf8");
        assert.ok(text.startsWith(GENERATED_HEADER + "\n"));
        assert.match(text, /Screen/);
        assert.equal(client.count("read"), 1);
        assert.equal((out.board as { id: string }).id, "board-1");

        fs.writeFileSync(outPath, GENERATED_HEADER + "\nstale\n");
        await service.pull({ board: "home", outPath });
        assert.ok(!fs.readFileSync(outPath, "utf8").includes("stale"));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("pull outPath with unset roots is FS_DISABLED before any runtime call", async () => {
    const { client, service } = setup();
    await assert.rejects(
        () => service.pull({ board: "home", outPath: path.join(os.tmpdir(), "x.tsx") }),
        (e: unknown) =>
            e instanceof JsxToolError &&
            e.code === "FS_DISABLED" &&
            e.hint === "set PENPOT_MCP_JSX_FS_ROOTS to enable outPath"
    );
    assert.equal(client.calls.length, 0);
});

test("pull refuses to overwrite an existing file without the generated header, before any runtime call", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-pull-"));
    try {
        const { client, service } = setup({}, { fsRoots: [dir] });
        const outPath = path.join(dir, "mine.tsx");
        fs.writeFileSync(outPath, "export const mine = 1;\n");
        await assert.rejects(
            () => service.pull({ board: "home", outPath }),
            (e: unknown) => e instanceof JsxToolError && e.code === "INVALID_ARGS" && /overwrite/.test(e.message)
        );
        assert.equal(fs.readFileSync(outPath, "utf8"), "export const mine = 1;\n");
        assert.equal(client.calls.length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("pull rejects an outPath outside the roots, a relative path and a bad extension", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-pull-"));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-other-"));
    try {
        const { client, service } = setup({}, { fsRoots: [dir] });
        for (const outPath of [path.join(other, "a.tsx"), "rel.tsx", path.join(dir, "a.txt")]) {
            await assert.rejects(
                () => service.pull({ board: "home", outPath }),
                (e: unknown) => e instanceof JsxToolError && e.code === "INVALID_ARGS"
            );
        }
        assert.equal(client.calls.length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(other, { recursive: true, force: true });
    }
});

test("an unexpected error mid-loop keeps the rendered screens and moves the rest to pending", async () => {
    const { client, service } = setup();
    client.elements = [screen("a", [button()]), screen("b", [button()]), screen("c", [button()])];
    const original = client.call.bind(client);
    client.call = async (op, args, opts) => {
        if (op === "render" && (args as { screen: { id: string } }).screen.id === "b") throw new TypeError("boom");
        return original(op, args, opts);
    };
    const out = await service.push({ source: SOURCE });
    const results = out.results as Results;
    assert.deepEqual(
        results.map((r) => [r.screenId, r.status]),
        [
            ["a", "rendered"],
            ["b", "error"],
        ]
    );
    assert.equal(results[1]!.error?.code, "INTERNAL");
    assert.ok(!JSON.stringify(results[1]).includes("boom"));
    assert.deepEqual(out.pending, ["c"]);
});

test("pull returns the JSX inline when it is small", async () => {
    const { service } = setup();
    const out = await service.pull({ screenId: "home" });
    assert.equal(typeof out.jsx, "string");
    assert.equal(out.bytes, Buffer.byteLength(out.jsx as string, "utf8"));
});

test("pull without board or screenId is INVALID_ARGS", async () => {
    const { client, service } = setup();
    await assert.rejects(
        () => service.pull({}),
        (e: unknown) => e instanceof JsxToolError && e.code === "INVALID_ARGS"
    );
    assert.equal(client.calls.length, 0);
});

test("pull with outPath in remote mode is FS_DISABLED before any runtime call", async () => {
    const { client, service } = setup({}, { isFileSystemAccessEnabled: () => false });
    await assert.rejects(
        () => service.pull({ board: "home", outPath: "/tmp/x.tsx" }),
        (e: unknown) => e instanceof JsxToolError && e.code === "FS_DISABLED"
    );
    assert.equal(client.calls.length, 0);
});

test("pull over 64 KiB without outPath fails with RESULT_TOO_LARGE", async () => {
    const { client, service } = setup();
    const children = Array.from({ length: 4000 }, (_, i) => ({
        t: "text" as const,
        text: { text: `A long line of copy number ${i} that makes the emitted source grow` },
        w: 100,
        h: 20,
    }));
    client.board = { ...client.board, children };
    await assert.rejects(
        () => service.pull({ board: "home" }),
        (e: unknown) => e instanceof JsxToolError && e.code === "RESULT_TOO_LARGE"
    );
});

test("source path arguments are refused in remote mode before any runtime call", async () => {
    const { client, service } = setup({}, { isFileSystemAccessEnabled: () => false });
    await assert.rejects(
        () => service.push({ sourcePath: "/tmp/x.tsx" }),
        (e: unknown) => e instanceof JsxToolError && e.code === "FS_DISABLED"
    );
    assert.equal(client.calls.length, 0);
});
