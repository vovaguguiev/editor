import { wrap } from "comlink";
import { CompilerWorker } from "./compilerWorker";
// @ts-ignore
// eslint-disable-next-line import/no-webpack-loader-syntax
import Worker from "worker-loader!./compilerWorker";
import { assert } from "./assert";
import { absolutePath } from "./absolutePath";
import { AbortError } from "./AbortError";

const compilerService = wrap<CompilerWorker>(new Worker());

type Hash = string;
type AbsPath = string;
type ExportSpecifier = string;
type ComponentName = string;

export type Module = {
    path: AbsPath;
    hash: Hash;
    codeBuffer: ArrayBuffer;
    localDependencies: DependenciesDict;
    componentsBySpecifier: Record<ExportSpecifier, ComponentName>;
};

type DependenciesDict = Record<AbsPath, Hash>;

const compilerCache = {} as {
    [path: string]:
        | { status: "pending" /*completion: Promise<void>*/ }
        | {
              status: "done";
              mod: Module;
          };
};

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

    // FIXME: don't compile if it's already in cache and up-to-date
    const workerCompileResult = await compilerService.compile(sourceCode, timestamp, { fastRefresh });
    if (signal.aborted) throw new AbortError();

    if (workerCompileResult.type === "failure") {
        return { type: "failure", error: workerCompileResult.error };
    }

    compilerCache[path] = { status: "pending" };

    // Make sure all the dependencies are hashed too
    for (const dep of workerCompileResult.localDependencies) {
        const depPath = absolutePath(path, dep);
        // FIXME: don't compile if the module is already in cache
        // if (compilerCache[depPath]) {
        //     // Dependency module is already in cache
        //     affectedModules.add(depPath);
        //     continue;
        // }

        compilerCache[depPath] = { status: "pending" };
        const depResult = await compileAndCache({
            path: depPath,
            readFile,
            affectedModules,
            fastRefresh,
            signal,
            timestamp
        });
        if (compilerCache[depPath].status === "pending") {
            delete compilerCache[depPath];
        }
        if (signal.aborted) {
            if (compilerCache[path]?.status === "pending") delete compilerCache[path];
            throw new AbortError();
        }

        if (depResult.type === "failure") {
            if (compilerCache[path]?.status === "pending") delete compilerCache[path];
            throw depResult;
        }

        compilerCache[depPath] = {
            status: "done",
            mod: {
                path: depPath,
                hash: depResult.hash,
                codeBuffer: depResult.codeBuffer,
                localDependencies: depResult.localDependencies,
                componentsBySpecifier: depResult.componentsBySpecifier
            }
        };
    }

    const localDependencies = workerCompileResult.localDependencies.reduce((result, dep) => {
        const depPath = absolutePath(path, dep);
        const cacheItem = compilerCache[depPath];
        assert(cacheItem, `${depPath} is missing in compiler cache`);
        assert(cacheItem.status !== "pending", `${depPath} is still pending in compiler cache`);
        result[depPath] = cacheItem.mod.hash;
        return result;
    }, {} as DependenciesDict);

    compilerCache[path] = {
        status: "done",
        mod: {
            path,
            hash: workerCompileResult.hash,
            codeBuffer: workerCompileResult.codeBuffer,
            localDependencies,
            componentsBySpecifier: (await workerCompileResult).componentsBySpecifier
        }
    };
    affectedModules.add(path);

    return {
        type: "success",
        localDependencies,
        componentsBySpecifier: workerCompileResult.componentsBySpecifier,
        codeBuffer: workerCompileResult.codeBuffer,
        hash: workerCompileResult.hash,
        affectedModules,
        timestamp
    };
}
