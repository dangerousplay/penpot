import type { PenpotMcpServer } from "../PenpotMcpServer";
import type { Tool } from "../Tool";
import { JsxComponentsTool } from "../tools/JsxComponentsTool";
import { JsxCompareTool } from "../tools/JsxCompareTool";
import { JsxPullTool } from "../tools/JsxPullTool";
import { JsxPushTool } from "../tools/JsxPushTool";
import { TokensCheckTool } from "../tools/TokensCheckTool";
import { TokensPushTool } from "../tools/TokensPushTool";
import type { JsxConfig } from "./JsxConfig";
import { JsxRuntimeClient, type RuntimeClient } from "./JsxRuntimeClient";
import { JsxService } from "./JsxService";

/**
 * Builds the JSX tools sharing one {@link JsxService} (and so one settle table). Empty when the config is
 * disabled. The runtime client reaches the plugin bridge lazily: tools are created before the bridge exists.
 */
export function createJsxTools(
    server: PenpotMcpServer,
    config: JsxConfig,
    client: RuntimeClient = JsxRuntimeClient.forServer(server)
): Tool<any>[] {
    if (!config.enabled) return [];
    const service = new JsxService({
        client,
        config,
        fs: {
            isFileSystemAccessEnabled: () => server.isFileSystemAccessEnabled(),
            fsRoots: config.fsRoots,
        },
        sessionKey: () => server.getSessionContext()?.userToken ?? "local",
    });
    return [
        new JsxComponentsTool(server, service),
        new JsxPushTool(server, service),
        new JsxPullTool(server, service),
        new JsxCompareTool(server, service),
        new TokensCheckTool(server, service),
        new TokensPushTool(server, service),
    ];
}
