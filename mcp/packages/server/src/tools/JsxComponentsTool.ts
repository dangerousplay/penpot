import { z } from "zod";
import "reflect-metadata";
import { Tool } from "../Tool";
import type { ToolResponse } from "../ToolResponse";
import type { PenpotMcpServer } from "../PenpotMcpServer";
import { respond, type ComponentsArgs as ServiceArgs, type JsxService } from "../jsx/JsxService";
import { profileField } from "../jsx/toolSchemas";

export class JsxComponentsArgs implements ServiceArgs {
    static schema = {
        filter: z.string().optional().describe("Substring or glob (* ?) on the tag or set name."),
        detail: z
            .boolean()
            .optional()
            .describe("Include slots (text layers); default: automatic, on for up to 60 matching components."),
        libraries: z.enum(["local", "all"]).optional().describe('"local" skips connected libraries; default "all".'),
        profile: profileField,
    };

    filter?: string;
    detail?: boolean;
    libraries?: "local" | "all";
    profile?: unknown;
}

/** Lists the open Penpot file's library components as JSX signatures. */
export class JsxComponentsTool extends Tool<JsxComponentsArgs> {
    constructor(
        mcpServer: PenpotMcpServer,
        private readonly service: JsxService
    ) {
        super(mcpServer, JsxComponentsArgs.schema);
    }

    public getToolName(): string {
        return "jsx_components";
    }

    public getToolDescription(): string {
        return (
            "Lists the components of the open Penpot file (local and connected libraries) as JSX tag signatures " +
            "with their variant props, slots and the theme token counts. Call it first, before jsx_push: use " +
            "exactly these tags and exact prop values. Options: filter (substring or glob), detail (slots), " +
            "libraries (local or all), profile. Returns compact JSON {ok, signatures, count, theme, warnings}. " +
            "Next tool: jsx_push (dryRun first). Requires the Penpot MCP plugin to be open in the file."
        );
    }

    protected async executeCore(args: JsxComponentsArgs): Promise<ToolResponse> {
        return respond(() => this.service.components(args));
    }
}
