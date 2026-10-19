import { z } from "zod";
import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type CompareArgs as ServiceArgs, type JsxService } from "../jsx/JsxService";
import { authoringShape } from "../jsx/toolSchemas";

export class JsxCompareArgs implements ServiceArgs {
    static schema = {
        ...authoringShape,
        maxDiffs: z.number().int().min(1).max(500).optional().describe("Diffs listed per screen; default 50."),
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
    maxDiffs?: number;
}

/** Compares a JSX source against the boards currently in the file. */
export class JsxCompareTool extends Tool<JsxCompareArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, JsxCompareArgs.schema);
    }

    public getToolName(): string {
        return "jsx_compare";
    }

    public getToolDescription(): string {
        return (
            "Reads the boards that jsx_push created and diffs them against the same JSX source, returning per " +
            "screen {equal, diffs[{path, expected, actual}], diffCount}. Takes the same source, page, screens, " +
            "messages, locale, strict, profile arguments as jsx_push, plus maxDiffs. It waits about 2 s after " +
            "a recent push so Penpot can settle. Screens not reached within the call budget are in `pending`: " +
            "call again with screens=pending. Path arguments are local-mode only; without " +
            "PENPOT_MCP_JSX_FS_ROOTS any absolute .json/.jsx/.tsx file is readable. If diffs remain, fix the " +
            "source and call jsx_push again; to inspect a board as code use jsx_pull."
        );
    }

    protected async executeCore(args: JsxCompareArgs): Promise<ToolResponse> {
        return respond(() => this.service.compare(args));
    }
}
