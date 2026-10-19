export interface RuntimeBuild {
    source: string;
    version: string;
    bytes: number;
}
export function buildRuntime(pkgDir?: string): Promise<RuntimeBuild>;
export function renderRuntimeModule(build: RuntimeBuild): string;
