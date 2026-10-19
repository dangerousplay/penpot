import { z } from "zod";
import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type JsxService, type TokensPushArgs as ServiceArgs } from "../jsx/JsxService";
import { tokensField, tokensPathField } from "../jsx/toolSchemas";

export class TokensPushArgs implements ServiceArgs {
    static schema = {
        tokens: tokensField,
        tokensPath: tokensPathField,
        confirm: z
            .boolean()
            .optional()
            .describe("Must be true to write. Without it nothing is written and the dry-run report is returned."),
    };

    tokens?: Record<string, unknown>;
    tokensPath?: string;
    confirm?: boolean;
}

/** Adds and updates design tokens in the open file's token library. Never deletes. */
export class TokensPushTool extends Tool<TokensPushArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, TokensPushArgs.schema);
    }

    public getToolName(): string {
        return "tokens_push";
    }

    public getToolDescription(): string {
        return (
            "Writes Penpot multi-set DTCG tokens (tokens or tokensPath, local mode) into the open file's token " +
            "library: adds missing tokens and updates same-type values, in batches of 200. It NEVER deletes. " +
            "Type mismatches and drifted aliases are reported as conflicts and not written; a shadow with " +
            "negative spread is reported as unrepresentable and skipped. Without confirm=true nothing is " +
            "written: it fails with TOKENS_CONFIRM_REQUIRED and the dry-run report, so show the counts to the " +
            "user and ask first. With confirm=true it waits about 2 s and returns {pushed, check}. Path " +
            "arguments are local-mode only; without PENPOT_MCP_JSX_FS_ROOTS any absolute .json file is " +
            "readable. Run tokens_check first; afterwards jsx_components shows the theme."
        );
    }

    protected async executeCore(args: TokensPushArgs): Promise<ToolResponse> {
        return respond(() => this.service.tokensPush(args));
    }
}
