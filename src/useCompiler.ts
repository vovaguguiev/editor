import { useEffect, useRef, useState } from "react";
import { wrap } from "comlink";
import { CompilerWorker } from "./compilerWorker";
import { Meta } from "./compilerWorker/compiler";

const compilerWorker = new Worker("./compilerWorker", {
  name: "compiler-worker",
  type: "module"
});
const workerApi = wrap<CompilerWorker>(compilerWorker);

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
  initialSourceCode?: string
): {
  result: CompilationResult | undefined;
  compile: (sourceCode: string, timestamp: number) => void;
} {
  const [result, setResult] = useState<CompilationResult | undefined>();
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (initialSourceCode) compile(initialSourceCode, Date.now());

    return () => {
      unmountedRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function compile(sourceCode: string, timestamp: number) {
    try {
      if (unmountedRef.current) return;

      const { meta, codeBuffer, hash } = await workerApi.compile(
        sourceCode,
        timestamp
      );
      if (unmountedRef.current) return;

      setResult({ type: "success", meta, codeBuffer, hash, timestamp });
    } catch (error) {
      if (unmountedRef.current) return;
      setResult({ type: "failure", error });
    }
  }

  return { result, compile };
}
