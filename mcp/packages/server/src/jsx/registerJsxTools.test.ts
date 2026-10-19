import assert from "node:assert/strict";
import test from "node:test";
import { PenpotMcpServer } from "../PenpotMcpServer";
import { loadJsxConfig } from "./JsxConfig";
import { createJsxTools } from "./registerJsxTools";

const JSX_TOOLS = ["jsx_components", "jsx_push", "jsx_pull", "jsx_compare", "tokens_check", "tokens_push"];
const quiet = { info() {}, warn() {}, error() {} };

async function withServer(env: Record<string, string>, run: (server: PenpotMcpServer) => void): Promise<void> {
    const saved: Record<string, string | undefined> = {};
    const all = { PENPOT_MCP_WEBSOCKET_PORT: "0", ...env };
    for (const [k, v] of Object.entries(all)) {
        saved[k] = process.env[k];
        process.env[k] = v;
    }
    let server: PenpotMcpServer | undefined;
    try {
        server = new PenpotMcpServer(false);
        run(server);
    } finally {
        await server?.stop();
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

test("PenpotMcpServer registers the 6 JSX tools by default", async () => {
    await withServer({}, (server) => {
        const names = server.getRegisteredToolNames();
        for (const name of JSX_TOOLS) assert.ok(names.includes(name), `${name} missing from ${names.join(",")}`);
        assert.ok(names.includes("execute_code"));
    });
});

test("PENPOT_MCP_JSX_ENABLE=false registers none of them", async () => {
    await withServer({ PENPOT_MCP_JSX_ENABLE: "false" }, (server) => {
        const names = server.getRegisteredToolNames();
        for (const name of JSX_TOOLS) assert.ok(!names.includes(name), `${name} must not be registered`);
        assert.ok(names.includes("execute_code"));
    });
});

test("a task timeout below 30 s registers none of them", async () => {
    await withServer({ PENPOT_MCP_TOOL_TIMEOUT_S: "20" }, (server) => {
        assert.ok(!server.getRegisteredToolNames().includes("jsx_push"));
    });
});

test("tool descriptions stay within 900 characters, name the next tool and schemas are zod shapes", async () => {
    await withServer({}, (server) => {
        const config = loadJsxConfig({}, quiet);
        const tools = createJsxTools(server, config);
        assert.deepEqual(
            tools.map((t) => t.getToolName()),
            JSX_TOOLS
        );
        for (const tool of tools) {
            const description = tool.getToolDescription();
            assert.ok(description.length <= 900, `${tool.getToolName()} description is ${description.length}`);
            assert.match(description, /(jsx_(push|compare|pull)|tokens_(check|push))/);
            assert.ok(Object.keys(tool.getInputSchema()).length > 0);
        }
    });
});

test("createJsxTools returns nothing when disabled", async () => {
    await withServer({}, (server) => {
        assert.deepEqual(createJsxTools(server, loadJsxConfig({ PENPOT_MCP_JSX_ENABLE: "false" }, quiet)), []);
    });
});
