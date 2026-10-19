import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type JsxService, type TokensArgs as ServiceArgs } from "../jsx/JsxService";
import { tokensField, tokensPathField } from "../jsx/toolSchemas";

export class TokensCheckArgs implements ServiceArgs {
    static schema = {
        tokens: tokensField,
        tokensPath: tokensPathField,
    };

    tokens?: Record<string, unknown>;
    tokensPath?: string;
}

/** Compares design tokens with the open file's token library (read-only), or lists the library. */
export class TokensCheckTool extends Tool<TokensCheckArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, TokensCheckArgs.schema);
    }

    public getToolName(): string {
        return "tokens_check";
    }

    public getToolDescription(): string {
        return (
            "Read-only. With tokens (or tokensPath, local mode) in Penpot multi-set DTCG form " +
            '({"<set>": {group: {name: {$type, $value}}}}), compares them with the open file\'s token library and ' +
            "returns {added, updated, unchanged, conflicts, aliasConflicts, unrepresentable, penpotOnlyCount, " +
            "penpotOnlySample}. conflicts are type mismatches and aliasConflicts are Penpot aliases whose value " +
            "drifts from the input: both are only reported, never written. unrepresentable are values Penpot " +
            "cannot hold (a shadow with negative spread). Without tokens it returns the library inventory " +
            "{sets, themes, themeKeys, collisions}. Path arguments are local-mode only; without " +
            "PENPOT_MCP_JSX_FS_ROOTS any absolute .json file is readable. To write the tokens use tokens_push."
        );
    }

    protected async executeCore(args: TokensCheckArgs): Promise<ToolResponse> {
        return respond(() => this.service.tokensCheck(args));
    }
}
