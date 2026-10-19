# Penpot MCP JSX tools (Nova Terra fork)

Work-in-progress notes for the `mcp-jsx` package (`packages/jsx`).

## Compatibility at 2.18.0

Probed at tag `2.18.0` (commit `5baffdc213f0deaaeb318e97a41d611ac0656a94`).
Toolchain: `pnpm@12.5.1` (the version pinned by `mcp/package.json`
`packageManager` at this tag, not 12.14.0), Node 22.18.0.

| Item | Present | Signature / location |
|---|---|---|
| `Tool` | yes | `export abstract class Tool<TArgs extends object>` in `packages/server/src/Tool.ts`. Constructor: `protected constructor(mcpServer: PenpotMcpServer, inputSchema: z.ZodRawShape)`. `execute(args: unknown): Promise<ToolResponse>` delegates to `executeCore`. |
| `Tool.SESSION_ID_SCHEMA` | no | There is no explicit session id. The session is implicit: `PenpotMcpServer.getSessionContext(): SessionContext \| undefined` (`userToken`). |
| `pluginBridge.executePluginTask` | yes | `public async executePluginTask<TResult extends PluginTaskResult<any>>(task: PluginTask<any, TResult>): Promise<TResult>` in `PluginBridge.ts`. There is no `sessionId` parameter. The connection is resolved from the session context in multi-user mode (`clientsByToken`), or is the single connected client otherwise. |
| `ExecuteCodePluginTask` | yes | `class ExecuteCodePluginTask extends PluginTask<ExecuteCodeTaskParams, PluginTaskResult<ExecuteCodeTaskResultData<any>>>`, constructor `(params: ExecuteCodeTaskParams)`, task type `"executeCode"`. `ExecuteCodeTaskParams = { code: string }` (`packages/common/src/types.ts`). |
| `ExecuteCodeTaskHandler` persistent `storage` | yes | `packages/plugin/src/task-handlers/ExecuteCodeTaskHandler.ts`: `this.context = { penpot, storage: {}, console, penpotUtils }`, created once in the constructor, so `storage` survives across calls. Code runs as `new Function(...Object.keys(ctx), "return (async () => { <code> })();")`. |
| Flag setting | yes | Around each run: `penpot.flags.naturalChildOrdering = true` and `penpot.flags.throwValidationErrors = true`, restored in `finally`. Throws an incompatibility error if `penpot.flags` is missing. |
| `penpot.waitForLayoutUpdate` | yes | `waitForLayoutUpdate(timeout?: number): Promise<void>` on `Context` (index.d.ts line 1364) and on `ShapeBase` (line 4122). Rejects on timeout or an invalid timeout. |
| Token `resolvedValue` | yes | `readonly resolvedValue: <T> \| undefined` on the token interfaces in `plugins/libs/plugin-types/index.d.ts` (number, string, string[], `TokenShadowValue[]`, `TokenTypographyValue[]`), plus `readonly resolvedValueString: string \| undefined`. |
| `penpot.library.connected` | yes | `readonly library: LibraryContext` on `Context`; `LibraryContext.connected: Library[]` (line 2849). |

Blocking items (`executePluginTask`, `ExecuteCodePluginTask`, persistent
`storage`) are all present. The two differences are `Tool.SESSION_ID_SCHEMA`
(absent) and the missing `sessionId` argument on `executePluginTask`.

## Baseline at 2.18.0

- `mcp-server` tests: 29 pass, 0 fail. `mcp-plugin`: 0 fail.
- `types:check` for `mcp-server...` passes only after `mcp-common` is built
  (`pnpm --filter mcp-common run build`). Otherwise `@penpot/mcp-common`
  cannot be resolved (`dist/` is missing).
- `pnpm run fmt:check` passes.
