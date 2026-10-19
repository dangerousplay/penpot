import assert from "node:assert/strict";
import * as fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function data(name: string): string {
    return fs.readFileSync(fileURLToPath(new URL(`../../data/${name}`, import.meta.url)), "utf8");
}

test("initial_instructions.md mentions all six JSX tools", () => {
    const text = data("initial_instructions.md");
    for (const tool of ["jsx_components", "jsx_push", "jsx_pull", "jsx_compare", "tokens_check", "tokens_push"]) {
        assert.ok(text.includes(tool), `${tool} missing`);
    }
});

test("base_instructions.md points to jsx_components", () => {
    assert.ok(data("base_instructions.md").includes("jsx_components"));
});

test("the JSX instructions name no Nova Terra specifics", () => {
    const text = data("initial_instructions.md") + data("base_instructions.md");
    assert.ok(!/nova[ -]?terra/i.test(text));
});
