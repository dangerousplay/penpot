import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
    loadMessages,
    loadProfile,
    loadSource,
    loadTokens,
    MAX_MESSAGES_BYTES,
    MAX_MESSAGES_FILE_BYTES,
    MAX_SOURCE_BYTES,
} from "./inputs";
import { JsxToolError } from "./results";

const LOCAL = { isFileSystemAccessEnabled: () => true };
const REMOTE = { isFileSystemAccessEnabled: () => false };

function code(fn: () => unknown): string {
    try {
        fn();
    } catch (e) {
        if (e instanceof JsxToolError) return e.code;
        throw e;
    }
    return "no-error";
}

function withDir<T>(fn: (dir: string) => T): T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-in-"));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test("source: inline XOR path, one is required", () => {
    assert.equal(loadSource({ source: "x" }, LOCAL), "x");
    assert.equal(
        code(() => loadSource({}, LOCAL)),
        "INVALID_ARGS"
    );
    assert.equal(
        code(() => loadSource({ source: "x", sourcePath: "/a" }, LOCAL)),
        "INVALID_ARGS"
    );
});

test("FS guard in remote mode: every *Path argument is FS_DISABLED", () => {
    assert.equal(
        code(() => loadSource({ sourcePath: "/a/b.jsx" }, REMOTE)),
        "FS_DISABLED"
    );
    assert.equal(
        code(() => loadMessages({ messagesPath: "/a/b.json" }, REMOTE)),
        "FS_DISABLED"
    );
    assert.equal(
        code(() => loadTokens({ tokensPath: "/a/b.json" }, REMOTE)),
        "FS_DISABLED"
    );
    // inline content is unaffected
    assert.equal(loadSource({ source: "ok" }, REMOTE), "ok");
});

test("paths must be absolute and exist", () => {
    assert.equal(
        code(() => loadSource({ sourcePath: "rel/x.jsx" }, LOCAL)),
        "INVALID_ARGS"
    );
    withDir((dir) => {
        assert.equal(
            code(() => loadSource({ sourcePath: path.join(dir, "nope.jsx") }, LOCAL)),
            "INVALID_ARGS"
        );
        assert.equal(
            code(() => loadSource({ sourcePath: dir }, LOCAL)),
            "INVALID_ARGS"
        );
    });
});

test("sourcePath is read through realpath", () => {
    withDir((dir) => {
        const file = path.join(dir, "a.jsx");
        fs.writeFileSync(file, "export default 1");
        assert.equal(loadSource({ sourcePath: file }, LOCAL), "export default 1");
    });
});

test("source caps: inline and on disk are SOURCE_TOO_LARGE", () => {
    assert.equal(
        code(() => loadSource({ source: "a".repeat(MAX_SOURCE_BYTES + 1) }, LOCAL)),
        "SOURCE_TOO_LARGE"
    );
    assert.doesNotThrow(() => loadSource({ source: "a".repeat(MAX_SOURCE_BYTES) }, LOCAL));
    withDir((dir) => {
        const file = path.join(dir, "big.jsx");
        fs.writeFileSync(file, "a".repeat(MAX_SOURCE_BYTES + 1));
        assert.equal(
            code(() => loadSource({ sourcePath: file }, LOCAL)),
            "SOURCE_TOO_LARGE"
        );
    });
});

test("messages caps: inline 512 KiB serialized, file 2 MiB, both INVALID_ARGS", () => {
    assert.equal(
        code(() => loadMessages({ messages: { k: "a".repeat(MAX_MESSAGES_BYTES) } }, LOCAL)),
        "INVALID_ARGS"
    );
    assert.deepEqual(loadMessages({ messages: { a: "b" } }, LOCAL), { a: "b" });
    assert.equal(loadMessages({}, LOCAL), undefined);
    assert.equal(
        code(() => loadMessages({ messages: {}, messagesPath: "/x" }, LOCAL)),
        "INVALID_ARGS"
    );
    withDir((dir) => {
        const big = path.join(dir, "big.json");
        fs.writeFileSync(big, " ".repeat(MAX_MESSAGES_FILE_BYTES + 1));
        assert.equal(
            code(() => loadMessages({ messagesPath: big }, LOCAL)),
            "INVALID_ARGS"
        );
        const good = path.join(dir, "ok.json");
        fs.writeFileSync(good, JSON.stringify({ a: { b: "c" } }));
        assert.deepEqual(loadMessages({ messagesPath: good }, LOCAL), { a: { b: "c" } });
        const arr = path.join(dir, "arr.json");
        fs.writeFileSync(arr, "[1]");
        assert.equal(
            code(() => loadMessages({ messagesPath: arr }, LOCAL)),
            "INVALID_ARGS"
        );
        const junk = path.join(dir, "junk.json");
        fs.writeFileSync(junk, "{");
        assert.equal(
            code(() => loadMessages({ messagesPath: junk }, LOCAL)),
            "INVALID_ARGS"
        );
    });
});

test("tokens: inline or path; bad JSON is TOKENS_INVALID", () => {
    assert.deepEqual(loadTokens({ tokens: { s: {} } }, LOCAL), { s: {} });
    assert.equal(loadTokens({}, LOCAL), undefined);
    withDir((dir) => {
        const file = path.join(dir, "t.json");
        fs.writeFileSync(file, '{"s":{}}');
        assert.deepEqual(loadTokens({ tokensPath: file }, LOCAL), { s: {} });
        fs.writeFileSync(file, "nope");
        assert.equal(
            code(() => loadTokens({ tokensPath: file }, LOCAL)),
            "TOKENS_INVALID"
        );
    });
});

test("profile: inline object is validated by ProfileSchema", () => {
    assert.equal(loadProfile({}), undefined);
    assert.deepEqual(loadProfile({ profile: { forbiddenPages: ["A"] } }), { forbiddenPages: ["A"] });
    assert.equal(
        code(() => loadProfile({ profile: { unknownField: 1 } })),
        "PROFILE_INVALID"
    );
    assert.equal(
        code(() => loadProfile({ profile: "x" })),
        "PROFILE_INVALID"
    );
});

test("JSON parse errors never echo file content", () => {
    withDir((dir) => {
        const file = path.join(dir, "secret.json");
        fs.writeFileSync(file, "SECRET=abc");
        for (const fn of [
            () => loadMessages({ messagesPath: file }, LOCAL),
            () => loadTokens({ tokensPath: file }, LOCAL),
        ]) {
            try {
                fn();
                assert.fail("expected an error");
            } catch (e) {
                assert.ok(e instanceof JsxToolError);
                assert.ok(!e.message.includes("SECRET"), e.message);
            }
        }
    });
});

test("extensions are enforced: .jsx/.tsx/.ts/.js for source, .json for messages and tokens", () => {
    withDir((dir) => {
        const txt = path.join(dir, "a.txt");
        fs.writeFileSync(txt, "x");
        assert.equal(
            code(() => loadSource({ sourcePath: txt }, LOCAL)),
            "INVALID_ARGS"
        );
        assert.equal(
            code(() => loadMessages({ messagesPath: txt }, LOCAL)),
            "INVALID_ARGS"
        );
        assert.equal(
            code(() => loadTokens({ tokensPath: txt }, LOCAL)),
            "TOKENS_INVALID"
        );
        for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
            const f = path.join(dir, `ok${ext}`);
            fs.writeFileSync(f, "export default 1");
            assert.equal(loadSource({ sourcePath: f }, LOCAL), "export default 1");
        }
        const json = path.join(dir, "x.json");
        fs.writeFileSync(json, "{}");
        assert.deepEqual(loadMessages({ messagesPath: json }, LOCAL), {});
    });
});

test("fs roots: inside passes; outside, directory and symlink escapes are rejected", () => {
    withDir((dir) => {
        const root = path.join(dir, "root");
        const outside = path.join(dir, "outside");
        fs.mkdirSync(root);
        fs.mkdirSync(outside);
        const inside = path.join(root, "a.jsx");
        const out = path.join(outside, "b.jsx");
        fs.writeFileSync(inside, "in");
        fs.writeFileSync(out, "out");
        const rooted = { isFileSystemAccessEnabled: () => true, fsRoots: [root] };
        assert.equal(loadSource({ sourcePath: inside }, rooted), "in");
        assert.equal(
            code(() => loadSource({ sourcePath: out }, rooted)),
            "INVALID_ARGS"
        );
        assert.equal(
            code(() => loadSource({ sourcePath: root }, rooted)),
            "INVALID_ARGS"
        );

        // symlinks may need privileges on Windows; skip that part when they cannot be created
        const link = path.join(root, "link.jsx");
        let linked = true;
        try {
            fs.symlinkSync(out, link, "file");
        } catch {
            linked = false;
        }
        if (linked) {
            assert.equal(
                code(() => loadSource({ sourcePath: link }, rooted)),
                "INVALID_ARGS"
            );
            const okLink = path.join(outside, "to-inside.jsx");
            fs.symlinkSync(inside, okLink, "file");
            const wide = { isFileSystemAccessEnabled: () => true, fsRoots: [root, outside] };
            assert.equal(loadSource({ sourcePath: okLink }, wide), "in");
        }
    });
});
