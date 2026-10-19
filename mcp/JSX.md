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

## Tools

Six MCP tools, registered by default next to the upstream tools (`PENPOT_MCP_JSX_ENABLE=false` removes them).
They all go through the Penpot MCP plugin, so the plugin must be open in the file. Every result is compact JSON,
`{"ok": true, ...}` or `{"ok": false, "error": {"code", "message", "line"?, "path"?, "hint"?, "valid"?}}`.

| Tool | Purpose | Arguments |
|---|---|---|
| `jsx_components` | Lists the file's library components as JSX tag signatures plus theme token counts. Read-only. | `filter`, `detail`, `libraries` (`local` \| `all`), `profile` |
| `jsx_push` | Renders the `<Screen>`s of a JSX/TSX source as boards. Screen ids are upsert keys. | `source` \| `sourcePath`, `page`, `screens`, `messages` \| `messagesPath`, `locale`, `strict`, `dryRun`, `maxScreens`, `profile` |
| `jsx_compare` | Diffs the boards against the same source. | as `jsx_push` (no `dryRun`), plus `maxDiffs` |
| `jsx_pull` | Reads a board back as JSX. | `board` \| `screenId`, `page`, `messages` \| `messagesPath`, `locale`, `outPath`, `profile` |
| `tokens_check` | Compares DTCG tokens with the file's token library (read-only), or lists the library when no tokens are given. | `tokens` \| `tokensPath` |
| `tokens_push` | Adds and updates tokens. Refuses without `confirm: true`. | `tokens` \| `tokensPath`, `confirm` |

Tokens use the Penpot multi-set DTCG form, `{"<set>": {"group": {"name": {"$type": "...", "$value": "..."}}}}`.
Token guarantees:

- `tokens_push` never deletes anything. Tokens present only in Penpot are counted (`penpotOnlyCount`), not touched.
- A type mismatch, or a Penpot alias whose resolved value differs from the input, is reported as a conflict and never
  written.
- A shadow with a negative spread is reported as `unrepresentable` and skipped (Penpot rejects it).
- Writes go in batches of at most 200 tokens per plugin task. After the writes the tool waits `PENPOT_MCP_JSX_SETTLE_MS`
  (2 s by default), then returns the post-push check.
- Without `confirm: true` nothing is written; the call fails with `TOKENS_CONFIRM_REQUIRED` and carries the dry-run
  report so the user can approve the counts.

### Path arguments, roots and `outPath`

`sourcePath`, `messagesPath`, `tokensPath` and `outPath` work in local mode only. In remote or multi-user mode they
fail with `FS_DISABLED` and the content must be sent inline.

- `PENPOT_MCP_JSX_FS_ROOTS` is an allowlist of directories, separated by the platform path delimiter (`;` on
  Windows, `:` elsewhere). When it is set, every path argument must resolve (symlinks followed) under one root.
- When it is **not** set, reads are unrestricted: the read tools accept any absolute `.json` / `.jsx` / `.tsx` file
  on the machine the server runs on (`sourcePath` also accepts `.ts` / `.js`; `messagesPath` and `tokensPath` accept
  `.json`). Set the variable to restrict them.
- `outPath` (`jsx_pull`) **requires** `PENPOT_MCP_JSX_FS_ROOTS`; without it the call fails with `FS_DISABLED`. The
  file must be `.tsx` or `.jsx`, its directory must exist under a root, and the target must not be a symlink. An
  existing file is overwritten only when its first line is the `@generated` header written by `jsx_pull`; any other
  file is refused, so a hand-written source is never replaced.

## Environment

Read by `JsxConfig` at startup.

| Variable | Default | Meaning |
|---|---|---|
| `PENPOT_MCP_JSX_ENABLE` | `true` | register the six tools |
| `PENPOT_MCP_JSX_FORBIDDEN_PAGES` | empty | `;`-separated page names that are never written (normalized comparison) |
| `PENPOT_MCP_JSX_DEFAULT_PAGE` | `JSX Drafts` | push target when `page` is omitted (created if missing) |
| `PENPOT_MCP_JSX_PROFILE` | unset | path to a profile JSON, loaded at startup and validated (a startup error if invalid) |
| `PENPOT_MCP_JSX_FS_ROOTS` | empty | allowlist for the `*Path` arguments; required for `outPath` (see above) |
| `PENPOT_MCP_JSX_CALL_BUDGET_S` | `300` | wall-clock budget per tool call |
| `PENPOT_MCP_JSX_MAX_SCREENS` | `12` | default `maxScreens` |
| `PENPOT_MCP_JSX_SETTLE_MS` | `2000` | settle after a push before a read-back |
| `PENPOT_MCP_TOOL_TIMEOUT_S` (existing) | `120` | per plugin task; below 30 the JSX tools are not registered |

## Local dev against a remote Penpot

Single-user workflow against a hosted Penpot instance, with the plugin served by the local MCP server.

1. `cd <penpot checkout> && git switch nova-terra/mcp-jsx`
2. `cd mcp && pnpm install && pnpm run build`
3. Start the server with the `PENPOT_MCP_JSX_*` variables you need (see above), plus `PENPOT_MCP_REPL_ENABLE=true`
   if you want the REPL, then `pnpm run start`. It serves the MCP endpoints on 4401 (HTTP `/mcp` and legacy SSE `/sse`), the plugin WebSocket on 4402, and the
   plugin on 4400.
4. In Penpot open the Plugin Manager (Ctrl+Alt+P), install `http://localhost:4400/manifest.json` and connect. The
   plugin is the stock one; the JSX runtime is injected into it at run time.
5. Point the MCP client at `http://localhost:4401/mcp`. For Claude Code:
   `claude mcp add --transport http penpot http://localhost:4401/mcp`.
