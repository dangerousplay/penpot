import { z } from "zod";

/** Zod fields shared by the JSX tools (design section 9). */
export const profileField = z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional inline profile object (aliases, defaults, forbiddenPages, ...); replaces the server profile.");

export const messagesField = z
    .record(z.string(), z.unknown())
    .optional()
    .describe("i18n messages for t() keys, nested or flat; at most 512 KiB. Not together with messagesPath.");

export const messagesPathField = z
    .string()
    .optional()
    .describe("Local mode only: absolute path of a messages .json file (at most 2 MiB). Not together with messages.");

export const localeField = z.string().optional().describe('BCP-47 locale for t() plurals; default "en".');

export const FS_ROOTS_NOTE =
    "Path arguments work in local mode only and need absolute paths; without PENPOT_MCP_JSX_FS_ROOTS any " +
    "absolute .json/.jsx/.tsx file on this machine is readable, so set it to restrict them.";

export const authoringShape = {
    source: z
        .string()
        .optional()
        .describe("JSX/TSX source (at most 256 KiB). Pass exactly one of source or sourcePath."),
    sourcePath: z
        .string()
        .optional()
        .describe("Local mode only: absolute path of a .tsx/.jsx file. Pass exactly one of source or sourcePath."),
    page: z.string().optional().describe("Target page name; default is the server's default page."),
    screens: z.array(z.string()).optional().describe("Subset of screen ids to process; default all."),
    messages: messagesField,
    messagesPath: messagesPathField,
    locale: localeField,
    strict: z.boolean().optional().describe("Fail on missing props, slots, classes and t() keys; default false."),
    maxScreens: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe("Screens per call (at most 24); the rest is pending."),
    profile: profileField,
};
