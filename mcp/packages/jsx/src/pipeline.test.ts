import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    LiveSnapshotSchema,
    buildRegistry,
    prepareScreen,
    replay,
    themeFromTokens,
    transpile,
    type Element,
} from "./index.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/generic-snapshot.json");

test("transpile + replay + prepareScreen runs under Node without Bun", () => {
    const { code } = transpile(
        'import { Screen, Button } from "@penpot/jsx";\nexport default <Screen id="home" platform="ios" title="Home"><Button style="Ghost" size="MD" label="Go" /></Screen>;\n'
    );
    assert.ok(code.includes("jsxDEV"));

    const snap = LiveSnapshotSchema.parse(JSON.parse(readFileSync(FIXTURE, "utf8")));
    const registry = buildRegistry(snap);
    const theme = themeFromTokens(snap.tokens ?? { sets: [], themes: [] });

    // What the plugin runtime returns after evaluating `code` in its sandbox.
    const tree: Element[] = [
        {
            $: "Screen",
            p: { id: "home", platform: "ios", title: "Home" },
            c: [{ $: "Button", p: { style: "Ghost", size: "MD", label: "Go" }, c: [] }],
        },
    ];
    const { screens, warnings } = replay(tree, { registry, theme });
    assert.deepEqual(
        warnings.filter((w) => !w.includes("Forms.TextField")),
        []
    );
    const screen = prepareScreen(screens[0]!, { registry, theme, locale: "en", warnings: [] });
    assert.equal(screen.name, "iOS · Home");
    assert.equal(screen.width, 393);
    assert.equal(screen.height, 852);
    const child = screen.children[0]!;
    assert.equal(child.kind, "component");
    if (child.kind === "component") {
        assert.equal(child.componentId, "b4");
        assert.deepEqual(child.slots["label"], { text: "Go" });
    }
});
