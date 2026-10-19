import { z } from "zod";
import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type JsxService, type PullArgs as ServiceArgs } from "../jsx/JsxService";
import { localeField, messagesField, messagesPathField, profileField } from "../jsx/toolSchemas";

export class JsxPullArgs implements ServiceArgs {
    static schema = {
        board: z.string().optional().describe("Board name or id (or screen id). Pass board or screenId."),
        screenId: z.string().optional().describe("Screen id stored on the board by jsx_push."),
        page: z.string().optional().describe("Page name; default: search every page."),
        messages: messagesField,
        messagesPath: messagesPathField,
        locale: localeField,
        outPath: z
            .string()
            .optional()
            .describe(
                "Local mode with PENPOT_MCP_JSX_FS_ROOTS only: absolute .tsx/.jsx path under a root to write the source to (new file, or one previously written by jsx_pull)."
            ),
        profile: profileField,
    };

    board?: string;
    screenId?: string;
    page?: string;
    messages?: Record<string, unknown>;
    messagesPath?: string;
    locale?: string;
    outPath?: string;
    profile?: unknown;
}

/** Reads a board of the open Penpot file back as JSX. */
export class JsxPullTool extends Tool<JsxPullArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, JsxPullArgs.schema);
    }

    public getToolName(): string {
        return "jsx_pull";
    }

    public getToolDescription(): string {
        return (
            "Reads a top-level board of the open Penpot file and returns equivalent JSX that uses the file's " +
            "library components, with t() calls where layers carry an i18n key. Pass board (name or id) or " +
            "screenId, optionally page, messages and locale (to report copy drift). Sources over 64 KiB fail " +
            "with RESULT_TOO_LARGE unless outPath is given: it needs local mode AND PENPOT_MCP_JSX_FS_ROOTS (else " +
            "FS_DISABLED), writes a generated-file header, and refuses to overwrite files without that header. " +
            "Other path arguments are local-mode only; without PENPOT_MCP_JSX_FS_ROOTS any absolute .json/.jsx/.tsx " +
            "file is readable. Returns {board, jsx, bytes, warnings, " +
            "copyDrift}. Edit the returned source, then call jsx_push, and verify with jsx_compare."
        );
    }

    protected async executeCore(args: JsxPullArgs): Promise<ToolResponse> {
        return respond(() => this.service.pull(args));
    }
}
