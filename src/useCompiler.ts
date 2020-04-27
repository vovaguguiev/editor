import { wrap } from "comlink";
import { CompilerWorker } from "./compilerWorker";
// @ts-ignore
// eslint-disable-next-line import/no-webpack-loader-syntax
import Worker from "worker-loader!./compilerWorker";
import { assert } from "./assert";
import { absolutePath } from "./absolutePath";
import { AbortError } from "./AbortError";
import { hashCode } from "./hashCode";

const compilerService = wrap<CompilerWorker>(new Worker());

type Hash = string;
type AbsPath = string;
type ExportSpecifier = string;
type ComponentName = string;

export type Module = {
    path: AbsPath;
    sourceHash: Hash;
    codeBuffer: ArrayBuffer;
    localDependencies: DependenciesDict;
    componentsBySpecifier: Record<ExportSpecifier, ComponentName>;
};

type DependenciesDict = Record<AbsPath, Hash>;

type CacheItemPending = { status: "pending" /*completion: Promise<void>*/ };
type CacheItemDone = {
    status: "done";
    mod: Module;
};
type CacheItem = CacheItemPending | CacheItemDone;
const compilerCache = {} as Record<AbsPath, CacheItem>;

interface PreviewComponentData {
    type: "componentData";
    path: string;
    componentSpecifier: ExportSpecifier;
    modules: { [path: string]: Module };
    timestamp: number;
}
interface PreviewErrorData {
    type: "errorData";
    errorMessage: string;
}
export type PreviewData = PreviewComponentData | PreviewErrorData;

export async function getPreviewData({
    path,
    readFile,
    fastRefresh,
    signal,
    timestamp
}: {
    path: string;
    readFile: (path: string) => string | undefined;
    timestamp: number;
    fastRefresh: boolean;
    signal: AbortSignal;
}): Promise<PreviewData> {
    const compilationResult = await compileAndCache({ path, readFile, fastRefresh, signal, timestamp });
    if (signal.aborted) {
        throw new AbortError();
    }

    if (compilationResult.type === "failure") {
        return {
            type: "errorData",
            errorMessage: compilationResult.error.message
        };
    }

    let modules = {} as Record<AbsPath, Module>;
    for (const modPath of compilationResult.affectedModules) {
        const cacheItem = compilerCache[modPath];
        assert(cacheItem?.status === "done", `${modPath} is missing in compiler cache`);
        modules[modPath] = cacheItem.mod;
    }

    return {
        type: "componentData",
        path,
        componentSpecifier: Object.keys(compilationResult.componentsBySpecifier)[0],
        modules,
        timestamp
    };
}

interface CompilationSuccess {
    type: "success";
    codeBuffer: ArrayBuffer;
    localDependencies: DependenciesDict;
    componentsBySpecifier: Record<ExportSpecifier, ComponentName>;
    hash: Hash;
    affectedModules: Set<AbsPath>;
    timestamp: number;
}
interface CompilationFailure {
    type: "failure";
    error: Error;
}
export type CompilationResult = CompilationSuccess | CompilationFailure;

async function compileAndCache({
    path,
    readFile,
    affectedModules,
    fastRefresh,
    signal,
    timestamp
}: {
    path: string;
    readFile: (path: string) => string | undefined;
    affectedModules?: Set<AbsPath>;
    fastRefresh: boolean;
    signal: AbortSignal;
    timestamp: number;
}): Promise<CompilationResult> {
    if (!affectedModules) affectedModules = new Set();

    const sourceCode = readFile(path);
    if (!sourceCode) {
        return { type: "failure", error: new Error(`${path} is not found`) };
    }
    const sourceHash = String(hashCode(sourceCode));

    const cacheItem = compilerCache[path];
    let localDependencyModules;
    let mod: Module;

    if (cacheItem?.status === "done" && cacheItem.mod.sourceHash === sourceHash) {
        mod = cacheItem.mod;
        localDependencyModules = Object.keys(cacheItem.mod.localDependencies);
    } else {
        const workerCompileResult = await compilerService.compile(sourceCode, timestamp, { fastRefresh });
        if (signal.aborted) throw new AbortError();
        if (workerCompileResult.type === "failure") {
            return { type: "failure", error: workerCompileResult.error };
        }
        compilerCache[path] = { status: "pending" };
        mod = {
            path,
            sourceHash,
            codeBuffer: workerCompileResult.codeBuffer,
            componentsBySpecifier: workerCompileResult.componentsBySpecifier,
            // we will fill it after processing all of the dependencies
            localDependencies: {}
        };
        localDependencyModules = workerCompileResult.localDependencies;
    }

    // Make sure all the dependencies are up-to-date too
    try {
        for (const dep of localDependencyModules) {
            const depPath = absolutePath(path, dep);
            const depResult = await compileAndCache({
                path: depPath,
                readFile,
                affectedModules,
                fastRefresh,
                signal,
                timestamp
            });
            if (signal.aborted) throw new AbortError();
            if (depResult.type === "failure") {
                return depResult;
            }
        }
    } finally {
        // Make sure we clear the pending cache item of the parent if we exit early in the block above
        if (compilerCache[path]?.status === "pending") delete compilerCache[path];
    }

    mod.localDependencies = localDependencyModules.reduce((result, dep) => {
        const depPath = absolutePath(path, dep);
        const cacheItem = compilerCache[depPath];
        assert(cacheItem, `${depPath} is missing in compiler cache`);
        assert(cacheItem.status !== "pending", `${depPath} is still pending in compiler cache`);
        result[depPath] = cacheItem.mod.sourceHash;
        return result;
    }, {} as DependenciesDict);

    compilerCache[path] = {
        status: "done",
        mod
    };

    affectedModules.add(path);

    return {
        type: "success",
        localDependencies: mod.localDependencies,
        componentsBySpecifier: mod.componentsBySpecifier,
        codeBuffer: mod.codeBuffer,
        hash: mod.sourceHash,
        affectedModules,
        timestamp
    };
}
