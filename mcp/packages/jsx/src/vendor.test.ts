import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkVendor } from "../scripts/check-vendor.mjs";

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function copyPkg(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "jsx-vendor-"));
    cpSync(path.join(PKG_DIR, "src/engine"), path.join(dir, "src/engine"), { recursive: true });
    cpSync(path.join(PKG_DIR, "VENDORED.json"), path.join(dir, "VENDORED.json"));
    return dir;
}

test("the committed engine matches VENDORED.json", () => {
    const result = checkVendor(PKG_DIR);
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
});

test("a modified vendored file is reported by name", () => {
    const dir = copyPkg();
    try {
        const file = path.join(dir, "src/engine/naming.ts");
        writeFileSync(file, `${readFileSync(file, "utf8")}\n// local edit\n`);
        const result = checkVendor(dir);
        assert.equal(result.ok, false);
        assert.ok(result.problems.some((p) => p.startsWith("naming.ts: modified")));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("unknown and missing files are reported", () => {
    const dir = copyPkg();
    try {
        writeFileSync(path.join(dir, "src/engine/extra.ts"), "export {};\n");
        rmSync(path.join(dir, "src/engine/errors.ts"));
        const result = checkVendor(dir);
        assert.equal(result.ok, false);
        assert.ok(result.problems.some((p) => p.startsWith("extra.ts: unknown")));
        assert.ok(result.problems.some((p) => p.startsWith("errors.ts: missing")));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a missing manifest fails", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jsx-vendor-"));
    try {
        assert.equal(checkVendor(dir).ok, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
