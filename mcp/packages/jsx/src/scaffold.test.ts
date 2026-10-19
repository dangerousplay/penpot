import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_JSX_SCAFFOLD } from "./index.js";

test("mcp-jsx scaffold is wired", () => {
    assert.equal(MCP_JSX_SCAFFOLD, true);
});
