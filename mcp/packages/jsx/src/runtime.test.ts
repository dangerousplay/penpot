import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRuntime } from "../scripts/build-runtime.mjs";
import { RUNTIME_BYTES, RUNTIME_SOURCE, RUNTIME_VERSION } from "./generated/runtime.js";

test("a fresh build equals the committed RUNTIME_SOURCE", async () => {
    const fresh = await buildRuntime();
    assert.equal(fresh.source, RUNTIME_SOURCE);
    assert.equal(fresh.version, RUNTIME_VERSION);
    assert.equal(fresh.bytes, RUNTIME_BYTES);
});

test("the runtime is at most 96 KiB and installs __penpotJsx", () => {
    assert.ok(RUNTIME_BYTES <= 96 * 1024, `runtime is ${RUNTIME_BYTES} bytes`);
    assert.equal(Buffer.byteLength(RUNTIME_SOURCE, "utf8"), RUNTIME_BYTES);
    assert.ok(RUNTIME_SOURCE.includes("__penpotJsx"));
    assert.match(RUNTIME_VERSION, /^[0-9a-f]{12}$/);
    assert.ok(RUNTIME_SOURCE.includes(RUNTIME_VERSION));
    assert.ok(!RUNTIME_SOURCE.includes("PLACEHOLDER"));
});
