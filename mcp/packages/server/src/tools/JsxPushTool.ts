import { z } from "zod";
import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type JsxService, type PushArgs as ServiceArgs } from "../jsx/JsxService";
import { authoringShape } from "../jsx/toolSchemas";

export class JsxPushArgs implements ServiceArgs {
    static schema = {
        ...authoringShape,
        dryRun: z.boolean().optional().describe("Validate and prepare only; nothing is written. Default false."),
    };

    source?: string;
    sourcePath?: string;
    page?: string;
    screens?: string[];
    messages?: Record<string, unknown>;
    messagesPath?: string;
    locale?: string;
    strict?: boolean;
    maxScreens?: number;
    profile?: unknown;
    dryRun?: boolean;
}

/** Renders the screens of a JSX source as boards in the open Penpot file. */
export class JsxPushTool extends Tool<JsxPushArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, JsxPushArgs.schema);
    }

    public getToolName(): string {
        return "jsx_push";
    }

    public getToolDescription(): string {
        return (
            "Renders the <Screen> elements of a JSX/TSX source as boards in the open Penpot file, using the file's " +
            "library components (tags from jsx_components). Pass source (or sourcePath, local mode), page, " +
            "screens, messages, locale, strict, dryRun, maxScreens. Everything is validated before any write; " +
            "screens are rendered one per plugin task, a failing screen does not stop the others, and screens " +
            "not reached within the call budget are returned in `pending`: call again with screens=pending. " +
            "Screen ids are stable upsert keys: boards carrying the id are replaced. Protected pages are refused " +
            "(PAGE_FORBIDDEN). Do not call execute_code while a push runs. Path arguments are local-mode only; " +
            "without PENPOT_MCP_JSX_FS_ROOTS any absolute .json/.jsx/.tsx file is readable. Next tool: jsx_compare."
        );
    }

    protected async executeCore(args: JsxPushArgs): Promise<ToolResponse> {
        return respond(() => this.service.push(args));
    }
}
