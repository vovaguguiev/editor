import { expose, transfer } from "comlink";
import { compile } from "./compiler";

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

        const sourceData = encoder.encode(sourceCode);
        const sourceHashBuffer = await crypto.subtle.digest("SHA-1", sourceData.buffer);
        const hashArray = Array.from(new Uint8Array(sourceHashBuffer));
        // convert bytes to hex string
        const sourceHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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
