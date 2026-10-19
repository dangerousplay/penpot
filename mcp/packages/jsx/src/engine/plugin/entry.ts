// GENERATED from nova-terra tools/design-bridge/src/engine/plugin/entry.ts @ e29d9f0056c3c1e4c6ab9913439507cfa19b14be. Do not edit; run engine:sync.
// IIFE entry of the plugin runtime (design §3). Sent as the install body of an `execute_code` call; it
// sets `storage.__penpotJsx` and is idempotent (re-installing replaces the object). The version comes
// from a build-time `define` (the first 12 hex of the bundle's sha256 in the fork build).

import { createRuntime } from "./runtime";
import type { Runtime, RuntimePenpot } from "./runtime";

declare const __PENPOT_JSX_VERSION__: string | undefined;
declare const storage: { __penpotJsx?: Runtime; [key: string]: unknown };

// Inert when imported by tests or bundled without Penpot globals.
if (typeof penpot !== "undefined" && typeof storage !== "undefined") {
	const version = typeof __PENPOT_JSX_VERSION__ === "string" ? __PENPOT_JSX_VERSION__ : "dev";
	storage.__penpotJsx = createRuntime(penpot as unknown as RuntimePenpot, { version });
}
