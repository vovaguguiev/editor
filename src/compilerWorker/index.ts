import { expose, transfer } from "comlink";
import { compile } from "./compiler";

const encoder = new TextEncoder();

const workerInterface = {
  async compile(sourceCode: string, timestamp: number, options: { fastRefresh: boolean }) {
    console.log("worker: received code %dms", Date.now() - timestamp);

    const { meta, code } = compile(sourceCode, options);
    console.log("worker: compilation done %dms", Date.now() - timestamp);

    const data = encoder.encode(code);
    const codeBuffer = data.buffer;

    console.log("worker: encoding done %dms", Date.now() - timestamp);

    const hashBuffer = await crypto.subtle.digest("SHA-1", codeBuffer);
    // convert buffer to byte array
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // convert bytes to hex string
    const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    console.log("worker: hashing done %dms", Date.now() - timestamp);

    return {
      meta,
      codeBuffer: transfer(codeBuffer, [codeBuffer]),
      hash,
      timestamp
    };
  }
};

export type CompilerWorker = typeof workerInterface;

expose(workerInterface);
