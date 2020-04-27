import { expose, transfer } from "comlink";
import { compile } from "./compiler";
import { hashCode } from "../hashCode";

export type CompilationResult = ResultSuccess | ResultFailure;
interface ResultSuccess {
    type: "success";
    codeBuffer: ArrayBuffer;
    localDependencies: string[];
    componentsBySpecifier: { [exportSpecifier: string]: string };
    hash: string;
    timestamp: number;
}
interface ResultFailure {
    type: "failure";
    error: Error;
    hash: string;
}

const encoder = new TextEncoder();

const workerInterface = {
    async compile(
        sourceCode: string,
        timestamp: number,
        options: { fastRefresh: boolean }
    ): Promise<CompilationResult> {
        console.log("worker: received code %dms", Date.now() - timestamp);

        const sourceHash = String(hashCode(sourceCode));
        console.log("worker: source hashing done %dms", Date.now() - timestamp);

        try {
            const { meta, code } = compile(sourceCode, options);
            console.log("worker: compilation done %dms", Date.now() - timestamp);

            const data = encoder.encode(code);
            const codeBuffer = data.buffer;
            console.log("worker: encoding done %dms", Date.now() - timestamp);

            return {
                type: "success",
                codeBuffer: transfer(codeBuffer, [codeBuffer]),
                localDependencies: meta.localDependencies,
                componentsBySpecifier: meta.componentsBySpecifier,
                hash: sourceHash,
                timestamp
            };
        } catch (error) {
            console.log("worker: compilation failed %dms", Date.now() - timestamp);
            return {
                type: "failure",
                error,
                hash: sourceHash
            };
        }
    }
};

export type CompilerWorker = typeof workerInterface;

expose(workerInterface);
