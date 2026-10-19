import assert from "node:assert/strict";
import test from "node:test";
import { JsxError } from "@penpot/mcp-jsx";
import { capList, DEFAULT_LIST_CAP, fail, JsxToolError, ok } from "./results";

function textOf(response: { content: unknown[] }): string {
    const first = response.content[0] as { type: string; text: string };
    assert.equal(first.type, "text");
    return first.text;
}

test("ok is one compact JSON text item, with no indentation", () => {
    const r = ok({ ms: 5, file: "f", nested: { a: [1, 2] } });
    assert.equal(r.content.length, 1);
    assert.equal(textOf(r), '{"ok":true,"ms":5,"file":"f","nested":{"a":[1,2]}}');
});

test("ok truncates long top-level lists and adds <name>Count", () => {
    const items = Array.from({ length: DEFAULT_LIST_CAP + 5 }, (_, i) => i);
    const body = JSON.parse(textOf(ok({ items, short: [1] })));
    assert.equal(body.items.length, DEFAULT_LIST_CAP);
    assert.equal(body.itemsCount, DEFAULT_LIST_CAP + 5);
    assert.deepEqual(body.short, [1]);
    assert.equal(body.shortCount, undefined);
});

test("capList always reports the full count", () => {
    assert.deepEqual(capList("diffs", [1, 2, 3], 2), { diffs: [1, 2], diffsCount: 3 });
});

test("fail with a bare code builds {ok:false,error:{code,message,...extra}}", () => {
    const r = fail("FS_DISABLED", "no fs", { hint: "inline it" });
    assert.equal(textOf(r), '{"ok":false,"error":{"code":"FS_DISABLED","message":"no fs","hint":"inline it"}}');
});

test("fail accepts JsxError and JsxToolError and keeps their location fields", () => {
    const e = new JsxError("JSX_SYNTAX", "bad", { line: 2, column: 4 });
    assert.deepEqual(JSON.parse(textOf(fail(e))), {
        ok: false,
        error: { code: "JSX_SYNTAX", message: "bad", line: 2, column: 4 },
    });
    const t = new JsxToolError("PLUGIN_TIMEOUT", "slow", { hint: "later" });
    assert.deepEqual(JSON.parse(textOf(fail(t, "override"))), {
        ok: false,
        error: { code: "PLUGIN_TIMEOUT", message: "override", hint: "later" },
    });
});
