import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { DesiredToken, TokenReport } from "@penpot/mcp-jsx";
import { loadJsxConfig, type BudgetOp } from "./JsxConfig";
import type { CallOptions, OpValue, RuntimeClient } from "./JsxRuntimeClient";
import { JsxService, respond, type Clock } from "./JsxService";
import { JsxToolError } from "./results";

const SNAPSHOT: unknown = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL("../../../jsx/src/fixtures/generic-snapshot.json", import.meta.url)), "utf8")
);

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

function emptyReport(over: Partial<TokenReport> = {}): TokenReport {
    return {
        added: 0,
        updated: 0,
        unchanged: 0,
        penpotOnly: 0,
        unrepresentable: [],
        conflicts: [],
        aliasConflicts: [],
        setsCreated: 0,
        details: { added: [], updated: [], penpotOnly: [] },
        ...over,
    };
}

class FakeClient implements RuntimeClient {
    calls: Call[] = [];
    /** report returned for dryRun calls */
    dryReport: TokenReport = emptyReport();
    failBatch: number | undefined;
    private writes = 0;

    constructor(private readonly clock: FakeClock) {}

    tokenCalls(): Call[] {
        return this.calls.filter((c) => c.op === "tokens");
    }

    async call<T = unknown>(op: BudgetOp, args: unknown, _opts: CallOptions): Promise<OpValue<T>> {
        const a = args as Record<string, unknown>;
        this.calls.push({ op, args: a });
        if (op === "snapshot") return { value: SNAPSHOT as T, ms: 1 };
        if (op === "tokens") {
            if (a.dryRun === true) return { value: this.dryReport as T, ms: 1 };
            this.writes++;
            if (this.failBatch === this.writes) throw new JsxToolError("PLUGIN_TIMEOUT", "plugin task timed out");
            const n = (a.desired as unknown[]).length;
            return { value: emptyReport({ added: n }) as T, ms: 1 };
        }
        throw new Error(`unexpected op ${op}`);
    }
}

function setup(roots: string[] = []) {
    const clock = new FakeClock();
    const client = new FakeClient(clock);
    const quiet = { info() {}, warn() {}, error() {} };
    const service = new JsxService({
        client,
        config: { ...loadJsxConfig({}, quiet), fsRoots: roots },
        fs: { isFileSystemAccessEnabled: () => true, fsRoots: roots },
        clock,
    });
    return { clock, client, service };
}

function dtcg(count: number): Record<string, unknown> {
    const colors: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) colors[`c${i}`] = { $type: "color", $value: "#ffffff" };
    return { core: colors };
}

function parse(res: { content: { text?: string }[] }): Record<string, unknown> {
    return JSON.parse(res.content[0]!.text!) as Record<string, unknown>;
}

test("tokens_push without confirm writes nothing and returns TOKENS_CONFIRM_REQUIRED with the report", async () => {
    const { client, service } = setup();
    client.dryReport = emptyReport({
        added: 3,
        penpotOnly: 1,
        details: { added: [], updated: [], penpotOnly: ["core::x"] },
    });
    const out = parse((await respond(() => service.tokensPush({ tokens: dtcg(3) }))) as never);
    assert.equal(out.ok, false);
    assert.equal((out.error as { code: string }).code, "TOKENS_CONFIRM_REQUIRED");
    assert.equal((out.report as { added: number }).added, 3);
    assert.ok(client.tokenCalls().every((c) => c.args.dryRun === true));
    assert.equal(client.tokenCalls().length, 1);
});

test("tokens_push with confirm=false is still refused", async () => {
    const { client, service } = setup();
    const out = parse((await respond(() => service.tokensPush({ tokens: dtcg(1), confirm: false }))) as never);
    assert.equal((out.error as { code: string }).code, "TOKENS_CONFIRM_REQUIRED");
    assert.equal(client.tokenCalls().filter((c) => c.args.dryRun !== true).length, 0);
});

test("450 tokens are pushed in 3 batches of at most 200, then a settle wait and a post-check", async () => {
    const { client, clock, service } = setup();
    const out = await service.tokensPush({ tokens: dtcg(450), confirm: true });
    const writes = client.tokenCalls().filter((c) => c.args.dryRun === false);
    assert.deepEqual(
        writes.map((c) => (c.args.desired as DesiredToken[]).length),
        [200, 200, 50]
    );
    const calls = client.tokenCalls();
    assert.equal(calls.length, 4);
    assert.equal(calls[3]!.args.dryRun, true);
    assert.equal((calls[3]!.args.desired as DesiredToken[]).length, 450);
    assert.deepEqual(clock.sleeps, [2000]);
    assert.deepEqual(out.pushed, { added: 450, updated: 0, setsCreated: 0, batches: 3 });
});

test("no delete or replace operation is ever sent to the runtime", async () => {
    const { client, service } = setup();
    await service.tokensPush({ tokens: dtcg(250), confirm: true });
    for (const c of client.calls) {
        assert.ok(c.op === "snapshot" || c.op === "tokens", `unexpected op ${c.op}`);
        assert.deepEqual(Object.keys(c.args).sort(), ["desired", "dryRun"]);
    }
});

test("the post-check reports conflicts, alias drift and unrepresentable shadows", async () => {
    const { client, service } = setup();
    client.dryReport = emptyReport({
        conflicts: [{ token: "core::a", reason: "type mismatch", code: "color:#fff", penpot: "spacing:4" }],
        aliasConflicts: [{ token: "core::b", alias: "{core.c}", resolved: "#000", code: "#fff" }],
        unrepresentable: [{ token: "core::s", reason: "negative spread", code: "x", penpot: "y" }],
    });
    const out = await service.tokensPush({ tokens: dtcg(2), confirm: true });
    const check = out.check as Record<string, unknown[]>;
    assert.equal(check.conflicts!.length, 1);
    assert.equal(check.aliasConflicts!.length, 1);
    assert.equal(check.unrepresentable!.length, 1);
});

test("a failing batch stops the push and tells the agent how many were applied", async () => {
    const { client, service } = setup();
    client.failBatch = 2;
    const out = parse((await respond(() => service.tokensPush({ tokens: dtcg(450), confirm: true }))) as never);
    const error = out.error as { code: string; hint: string };
    assert.equal(error.code, "PLUGIN_TIMEOUT");
    assert.match(error.hint, /batch 2 of 3 failed after 1 applied/);
    assert.equal(client.tokenCalls().length, 2);
});

test("invalid DTCG is TOKENS_INVALID and costs no runtime call", async () => {
    const { client, service } = setup();
    const out = parse(
        (await respond(() => service.tokensPush({ tokens: { core: { a: { $value: "1" } } }, confirm: true }))) as never
    );
    assert.equal((out.error as { code: string }).code, "TOKENS_INVALID");
    assert.equal(client.calls.length, 0);
});

test("tokens_push without tokens or with an empty document is INVALID_ARGS", async () => {
    const { service } = setup();
    for (const args of [{ confirm: true }, { tokens: {}, confirm: true }]) {
        const out = parse((await respond(() => service.tokensPush(args))) as never);
        assert.equal((out.error as { code: string }).code, "INVALID_ARGS");
    }
});

test("tokens_check with tokens is a dry run with capped samples", async () => {
    const { client, service } = setup();
    const names = Array.from({ length: 30 }, (_, i) => `core::p${i}`);
    client.dryReport = emptyReport({
        unchanged: 2,
        penpotOnly: 30,
        details: { added: [], updated: [], penpotOnly: names },
    });
    const out = await service.tokensCheck({ tokens: dtcg(2) });
    assert.equal(out.unchanged, 2);
    assert.equal(out.penpotOnlyCount, 30);
    assert.equal((out.penpotOnlySample as string[]).length, 20);
    assert.ok(client.tokenCalls().every((c) => c.args.dryRun === true));
});

test("tokens_check without tokens returns the inventory", async () => {
    const { client, service } = setup();
    const out = await service.tokensCheck({});
    assert.equal(client.tokenCalls().length, 0);
    assert.ok(Array.isArray(out.sets));
    for (const s of out.sets as { name: string; active: boolean; count: number }[]) {
        assert.equal(typeof s.name, "string");
        assert.equal(typeof s.active, "boolean");
        assert.equal(typeof s.count, "number");
    }
    assert.ok(Array.isArray(out.themes));
    assert.deepEqual(Object.keys(out.themeKeys as object), ["colors", "spacing", "radius", "shadow"]);
    assert.ok(Array.isArray(out.collisions));
});

test("tokensPath reads a DTCG file under the allowed roots and refuses one outside", async () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? "/tmp"), "tok-"));
    const file = path.join(dir, "tokens.json");
    fs.writeFileSync(file, JSON.stringify(dtcg(2)));
    try {
        const inside = setup([dir]);
        const ok = await inside.service.tokensCheck({ tokensPath: file });
        assert.equal(ok.unchanged, 0);
        const other = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? "/tmp"), "tok-"));
        try {
            const outside = setup([other]);
            const res = parse((await respond(() => outside.service.tokensCheck({ tokensPath: file }))) as never);
            assert.equal((res.error as { code: string }).code, "TOKENS_INVALID");
        } finally {
            fs.rmSync(other, { recursive: true, force: true });
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
