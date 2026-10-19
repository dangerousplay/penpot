import assert from "node:assert/strict";
import * as fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RUNTIME_SOURCE, RUNTIME_VERSION } from "@penpot/mcp-jsx";
import {
    BRIDGE_ERROR_FRAGMENTS,
    buildInstallBody,
    buildOpBody,
    JsxRuntimeClient,
    mapBridgeError,
    type BridgeResult,
    type PluginTaskBridge,
} from "./JsxRuntimeClient";
import { JsxToolError } from "./results";
import { PluginBridge } from "../PluginBridge";

/** Simulates the plugin: a `storage` that survives between tasks and can be cleared (plugin reload). */
class FakePlugin {
    storageVersion: string | null = null;
    opCalls: string[] = [];
    installs = 0;
    /** value the install body reports; defaults to the real version */
    installReports: string | null = RUNTIME_VERSION;
    /** when true, installing does not make the guard pass (simulates an overwrite) */
    installIsIneffective = false;
    reply: unknown = { ok: true, value: { hello: "world" }, ms: 7 };

    reload(): void {
        this.storageVersion = null;
    }

    readonly bridge: PluginTaskBridge = async (task): Promise<BridgeResult> => {
        const code = task.params.code;
        if (code.startsWith(RUNTIME_SOURCE)) {
            this.installs++;
            if (!this.installIsIneffective) this.storageVersion = RUNTIME_VERSION;
            return { data: { result: { installed: this.installReports } } };
        }
        this.opCalls.push(code);
        if (this.storageVersion !== RUNTIME_VERSION) {
            return { data: { result: { __jsx: "install-needed", have: this.storageVersion } } };
        }
        return { data: { result: this.reply } };
    };
}

const OPTS = { budgetMs: 80_000 };

function isToolError(code: string): (e: unknown) => boolean {
    return (e) => e instanceof JsxToolError && e.code === code;
}

test("installs on the first call, then does not reinstall", async () => {
    const plugin = new FakePlugin();
    const client = new JsxRuntimeClient(plugin.bridge);

    const first = await client.call("ping", {}, OPTS);
    assert.deepEqual(first, { value: { hello: "world" }, ms: 7 });
    assert.equal(plugin.installs, 1);
    assert.equal(plugin.opCalls.length, 2); // miss + retry

    await client.call("ping", {}, OPTS);
    assert.equal(plugin.installs, 1);
    assert.equal(plugin.opCalls.length, 3);
});

test("reinstalls after a plugin reload clears storage", async () => {
    const plugin = new FakePlugin();
    const client = new JsxRuntimeClient(plugin.bridge);
    await client.call("ping", {}, OPTS);
    plugin.reload();
    const again = await client.call("ping", {}, OPTS);
    assert.equal(again.ms, 7);
    assert.equal(plugin.installs, 2);
});

test("a second install-needed fails with RUNTIME_INSTALL_FAILED after exactly one retry", async () => {
    const plugin = new FakePlugin();
    plugin.installIsIneffective = true;
    const client = new JsxRuntimeClient(plugin.bridge);
    await assert.rejects(() => client.call("ping", {}, OPTS), isToolError("RUNTIME_INSTALL_FAILED"));
    assert.equal(plugin.installs, 1);
    assert.equal(plugin.opCalls.length, 2);
});

test("a version mismatch reported by the install fails with RUNTIME_INSTALL_FAILED and no retry", async () => {
    const plugin = new FakePlugin();
    plugin.installReports = "deadbeef0000";
    const client = new JsxRuntimeClient(plugin.bridge);
    await assert.rejects(() => client.call("ping", {}, OPTS), isToolError("RUNTIME_INSTALL_FAILED"));
    assert.equal(plugin.opCalls.length, 1);
});

test("a plugin error while installing becomes RUNTIME_INSTALL_FAILED; a transport error keeps its code", async () => {
    const plugin = new FakePlugin();
    const broken = new JsxRuntimeClient(async (task, sid) => {
        if (task.params.code.startsWith(RUNTIME_SOURCE)) throw new Error("SyntaxError: boom");
        return plugin.bridge(task, sid);
    });
    await assert.rejects(() => broken.call("ping", {}, OPTS), isToolError("RUNTIME_INSTALL_FAILED"));

    const slow = new JsxRuntimeClient(async (task, sid) => {
        if (task.params.code.startsWith(RUNTIME_SOURCE)) throw new Error("Task abc timed out after 120 seconds");
        return plugin.bridge(task, sid);
    });
    await assert.rejects(() => slow.call("ping", {}, OPTS), isToolError("PLUGIN_TIMEOUT"));
});

test("op body is guarded by the version and carries op and JSON args; both bodies parse", () => {
    const body = buildOpBody("render", { screen: { id: "a b" } });
    assert.ok(body.includes(`r.version !== "${RUNTIME_VERSION}"`));
    assert.ok(body.includes('r.op("render", JSON.parse('));
    assert.ok(body.includes("install-needed"));
    const install = buildInstallBody();
    assert.ok(install.startsWith(RUNTIME_SOURCE));
    assert.ok(install.endsWith("return { installed: storage.__penpotJsx.version };"));
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => unknown;
    assert.doesNotThrow(() => new AsyncFunction("penpot", "storage", body));
    assert.doesNotThrow(() => new AsyncFunction("penpot", "storage", install));
});

test("budgetMs is injected into the budgeted ops, not ping", async () => {
    const plugin = new FakePlugin();
    plugin.storageVersion = RUNTIME_VERSION;
    const client = new JsxRuntimeClient(plugin.bridge);
    await client.call("render", { screen: {} }, { budgetMs: 1234 });
    await client.call("evaluate", { code: "x", scope: {} }, { budgetMs: 1234 });
    await client.call("ping", {}, { budgetMs: 1234 });
    assert.ok(plugin.opCalls[0].includes("budgetMs"));
    assert.ok(plugin.opCalls[1].includes("budgetMs"));
    assert.ok(!plugin.opCalls[2].includes("budgetMs"));
});

test("an {ok:false} reply becomes a JsxToolError with the runtime code and location", async () => {
    const plugin = new FakePlugin();
    plugin.storageVersion = RUNTIME_VERSION;
    plugin.reply = { ok: false, error: { code: "PAGE_FORBIDDEN", message: "no", line: 3, hint: "pick another" } };
    const client = new JsxRuntimeClient(plugin.bridge);
    await assert.rejects(
        () => client.call("render", {}, OPTS),
        (e: unknown) =>
            e instanceof JsxToolError && e.code === "PAGE_FORBIDDEN" && e.line === 3 && e.hint === "pick another"
    );
});

test("a malformed reply is a PLUGIN_ERROR", async () => {
    const plugin = new FakePlugin();
    plugin.storageVersion = RUNTIME_VERSION;
    plugin.reply = "nope";
    const client = new JsxRuntimeClient(plugin.bridge);
    await assert.rejects(() => client.call("ping", {}, OPTS), isToolError("PLUGIN_ERROR"));
});

test("sessionId is passed through to the injected bridge", async () => {
    const seen: (string | undefined)[] = [];
    const plugin = new FakePlugin();
    plugin.storageVersion = RUNTIME_VERSION;
    const client = new JsxRuntimeClient(async (task, sid) => {
        seen.push(sid);
        return plugin.bridge(task, sid);
    });
    await client.call("ping", {}, { sessionId: "s1", budgetMs: 1000 });
    assert.deepEqual(seen, ["s1"]);
});

test("bridge error texts map to transport codes", () => {
    const code = (m: string): string | undefined => mapBridgeError(new Error(m))?.code;
    assert.equal(
        code("No Penpot plugin instances are currently connected. Please ensure the plugin is running and connected."),
        "PLUGIN_NOT_CONNECTED"
    );
    assert.equal(code(PluginBridge.MULTIUSER_CONNECTION_ERROR_MESSAGE), "PLUGIN_NOT_CONNECTED");
    assert.equal(code("Plugin instance is disconnected. Task could not be sent."), "PLUGIN_NOT_CONNECTED");
    assert.equal(code("Plugin not connected on the receiving instance"), "PLUGIN_NOT_CONNECTED");
    assert.equal(
        code("The Penpot plugin tab has been frozen by the browser and cannot run tasks."),
        "PLUGIN_NOT_CONNECTED"
    );
    assert.equal(
        code("The Penpot plugin tab appears to be suspended by the browser (no heartbeat for 45s)"),
        "PLUGIN_NOT_CONNECTED"
    );
    assert.equal(
        code(
            "Multiple (2) Penpot MCP Plugin instances are connected. Ask the user to ensure that only one instance is connected at a time."
        ),
        "SESSION_AMBIGUOUS"
    );
    const timeout = mapBridgeError(new Error("Task 1234 timed out after 120 seconds"));
    assert.equal(timeout?.code, "PLUGIN_TIMEOUT");
    assert.match(timeout?.hint ?? "", /jsx_compare or jsx_pull/);
    assert.equal(mapBridgeError(new Error("ReferenceError: x is not defined")), undefined);
});

test("copied bridge fragments still occur in PluginBridge.ts (drift guard)", () => {
    const raw = fs.readFileSync(fileURLToPath(new URL("../PluginBridge.ts", import.meta.url)), "utf8");
    // template literals are split over lines and joined with `+`; normalise to one run of text
    const source = raw.replace(/[`"']\s*\+\s*[`"']/g, "").replace(/\s+/g, " ");
    for (const [name, fragment] of Object.entries(BRIDGE_ERROR_FRAGMENTS)) {
        assert.ok(source.includes(fragment), `PluginBridge.ts no longer contains ${name}: "${fragment}"`);
    }
});

test("PluginBridge.MULTIUSER_CONNECTION_ERROR_MESSAGE contains the copied fragment", () => {
    assert.ok(PluginBridge.MULTIUSER_CONNECTION_ERROR_MESSAGE.includes(BRIDGE_ERROR_FRAGMENTS.noInstanceForToken));
});

test("concurrent calls that all miss share a single install", async () => {
    const plugin = new FakePlugin();
    const client = new JsxRuntimeClient(plugin.bridge);
    const results = await Promise.all([
        client.call("ping", {}, OPTS),
        client.call("ping", {}, OPTS),
        client.call("ping", {}, OPTS),
    ]);
    assert.equal(results.length, 3);
    assert.equal(plugin.installs, 1);
});

test("args keep __proto__ keys as own properties through the op body", async () => {
    const args = JSON.parse('{"__proto__":{"x":1},"a":2}');
    const body = buildOpBody("render", args);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
        ...a: string[]
    ) => (penpot: unknown, storage: unknown) => Promise<unknown>;
    const fn = new AsyncFunction("penpot", "storage", body);
    const storage = { __penpotJsx: { version: RUNTIME_VERSION, op: async (_n: string, a: unknown) => a } };
    const got = (await fn({}, storage)) as object;
    assert.ok(Object.prototype.hasOwnProperty.call(got, "__proto__"));
});

test("unwrap passes valid through and maps unknown plugin codes to PLUGIN_ERROR", async () => {
    const plugin = new FakePlugin();
    plugin.storageVersion = RUNTIME_VERSION;
    plugin.reply = { ok: false, error: { code: "JSX_INVALID_VARIANT", message: "m", valid: ["a", "b"] } };
    const client = new JsxRuntimeClient(plugin.bridge);
    await assert.rejects(
        () => client.call("render", {}, OPTS),
        (e: unknown) => e instanceof JsxToolError && e.code === "JSX_INVALID_VARIANT" && e.valid?.join() === "a,b"
    );
    plugin.reply = { ok: false, error: { code: "WHO_KNOWS", message: "m" } };
    await assert.rejects(() => client.call("render", {}, OPTS), isToolError("PLUGIN_ERROR"));
});
