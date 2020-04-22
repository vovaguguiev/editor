import { useEffect, useRef, useState } from "react";
import { wrap } from "comlink";
import { CompilerWorker } from "./compilerWorker";
// @ts-ignore
// eslint-disable-next-line import/no-webpack-loader-syntax
import Worker from "worker-loader!./compilerWorker";
import { Meta } from "./compilerWorker/compiler";

const workerApi = wrap<CompilerWorker>(new Worker());

export type CompilationResult = ResultSuccess | ResultFailure;

interface ResultSuccess {
    type: "success";
    meta: Meta;
    codeBuffer: ArrayBuffer;
    hash: string;
    timestamp: number;
}

interface ResultFailure {
    type: "failure";
    error: Error;
}

export function useCompiler(
    fastRefresh: boolean,
    initialSourceCode?: string
): {
    result: CompilationResult | undefined;
    compile: (sourceCode: string, timestamp: number, fastRefresh: boolean) => void;
} {
    const [result, setResult] = useState<CompilationResult | undefined>();
    const unmountedRef = useRef(false);

    useEffect(() => {
        if (initialSourceCode) compile(initialSourceCode, Date.now(), fastRefresh);

        return () => {
            unmountedRef.current = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function compile(sourceCode: string, timestamp: number, fastRefresh: boolean) {
        try {
            if (unmountedRef.current) return;

            const { meta, codeBuffer, hash } = await workerApi.compile(sourceCode, timestamp, { fastRefresh });
            if (unmountedRef.current) return;

            setResult({ type: "success", meta, codeBuffer, hash, timestamp });
        } catch (error) {
            if (unmountedRef.current) return;
            setResult({ type: "failure", error });
        }
    }

    return { result, compile };
}
