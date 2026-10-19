import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { computeBudgetMs, loadJsxConfig, type JsxLog } from "./JsxConfig";
import { JsxToolError } from "./results";

function makeLog(): JsxLog & { lines: string[] } {
    const lines: string[] = [];
    return {
        lines,
        info: (m) => lines.push(`info: ${m}`),
        warn: (m) => lines.push(`warn: ${m}`),
        error: (m) => lines.push(`error: ${m}`),
    };
}

function withDir<T>(fn: (dir: string) => T): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-cfg-"));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test("defaults", () => {
    const cfg = loadJsxConfig({}, makeLog());
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.toolTimeoutS, 120);
    assert.equal(cfg.callBudgetMs, 300_000);
    assert.equal(cfg.maxScreens, 12);
    assert.equal(cfg.settleMs, 2000);
    assert.equal(cfg.defaultPage, "JSX Drafts");
    assert.deepEqual(cfg.forbiddenPages, []);
    assert.equal(cfg.profile, undefined);
});

test("budget arithmetic for T = 120: every op keeps its default", () => {
    const cfg = loadJsxConfig({ PENPOT_MCP_TOOL_TIMEOUT_S: "120" }, makeLog());
    assert.equal(cfg.budgetMs("snapshot"), 30_000);
    assert.equal(cfg.budgetMs("evaluate"), 10_000);
    assert.equal(cfg.budgetMs("render"), 80_000);
    assert.equal(cfg.budgetMs("read"), 30_000);
    assert.equal(cfg.budgetMs("tokens"), 60_000);
});

test("budget arithmetic for T = 45: ops clamp to T*1000 - 15000 = 30000", () => {
    const log = makeLog();
    const cfg = loadJsxConfig({ PENPOT_MCP_TOOL_TIMEOUT_S: "45" }, log);
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.budgetMs("snapshot"), 30_000);
    assert.equal(cfg.budgetMs("evaluate"), 10_000);
    assert.equal(cfg.budgetMs("render"), 30_000);
    assert.equal(cfg.budgetMs("read"), 30_000);
    assert.equal(cfg.budgetMs("tokens"), 30_000);
    assert.ok(log.lines.some((l) => l.startsWith("info:") && l.includes("shrink")));
});

test("computeBudgetMs never goes below 1000", () => {
    assert.equal(computeBudgetMs("render", 10), 1000);
});

test("T < 30 disables the tools and logs the reason", () => {
    const log = makeLog();
    const cfg = loadJsxConfig({ PENPOT_MCP_TOOL_TIMEOUT_S: "29" }, log);
    assert.equal(cfg.enabled, false);
    assert.match(cfg.disabledReason ?? "", /below 30/);
    assert.ok(log.lines.some((l) => l.startsWith("error:")));
    assert.equal(loadJsxConfig({ PENPOT_MCP_TOOL_TIMEOUT_S: "30" }, makeLog()).enabled, true);
});

test("PENPOT_MCP_JSX_ENABLE=false disables", () => {
    const cfg = loadJsxConfig({ PENPOT_MCP_JSX_ENABLE: "false" }, makeLog());
    assert.equal(cfg.enabled, false);
    assert.match(cfg.disabledReason ?? "", /ENABLE/);
});

test("an invalid number warns and falls back", () => {
    const log = makeLog();
    const cfg = loadJsxConfig({ PENPOT_MCP_JSX_MAX_SCREENS: "abc" }, log);
    assert.equal(cfg.maxScreens, 12);
    assert.ok(log.lines.some((l) => l.startsWith("warn:")));
});

test("profile file is loaded; forbidden pages are the union of env and profile", () => {
    withDir((dir) => {
        const file = path.join(dir, "p.json");
        fs.writeFileSync(file, JSON.stringify({ forbiddenPages: ["Verification", "Shared"], defaultPage: "Pilot" }));
        const cfg = loadJsxConfig(
            { PENPOT_MCP_JSX_PROFILE: file, PENPOT_MCP_JSX_FORBIDDEN_PAGES: "Shared; Other ;" },
            makeLog()
        );
        assert.deepEqual([...cfg.forbiddenPages].sort(), ["Other", "Shared", "Verification"]);
        assert.equal(cfg.defaultPage, "Pilot");
        const withEnvPage = loadJsxConfig(
            { PENPOT_MCP_JSX_PROFILE: file, PENPOT_MCP_JSX_DEFAULT_PAGE: "Env" },
            makeLog()
        );
        assert.equal(withEnvPage.defaultPage, "Env");
    });
});

test("an invalid or missing profile file fails fast with PROFILE_INVALID", () => {
    withDir((dir) => {
        const bad = path.join(dir, "bad.json");
        fs.writeFileSync(bad, JSON.stringify({ nope: true }));
        const isProfileInvalid = (e: unknown): boolean => e instanceof JsxToolError && e.code === "PROFILE_INVALID";
        assert.throws(() => loadJsxConfig({ PENPOT_MCP_JSX_PROFILE: bad }, makeLog()), isProfileInvalid);
        assert.throws(
            () => loadJsxConfig({ PENPOT_MCP_JSX_PROFILE: path.join(dir, "missing.json") }, makeLog()),
            isProfileInvalid
        );
    });
});

test("timeout is parsed with parseInt like the bridge, and fs roots split on the path delimiter", () => {
    assert.equal(loadJsxConfig({ PENPOT_MCP_TOOL_TIMEOUT_S: "45s" }, makeLog()).toolTimeoutS, 45);
    const cfg = loadJsxConfig({ PENPOT_MCP_JSX_FS_ROOTS: ["/a", "/b", ""].join(path.delimiter) }, makeLog());
    assert.deepEqual(cfg.fsRoots, ["/a", "/b"]);
    assert.deepEqual(loadJsxConfig({}, makeLog()).fsRoots, []);
});
