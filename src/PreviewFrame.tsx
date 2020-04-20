import React, { ReactNode, useEffect, useRef } from "react";
import { wrap, transfer, Remote } from "comlink";
import { CompilationResult } from "./useCompiler";
import { Meta } from "./compilerWorker/compiler";
import { PREVIEW_ORIGIN } from "./config";

type PreviewService = {
  render: (
    meta: Meta,
    codeBuffer: ArrayBuffer,
    hash: string,
    timestamp: number
  ) => void;
};

export function PreviewFrame({
  compilationResult
}: {
  compilationResult: CompilationResult | undefined;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewServiceRef = useRef<Remote<PreviewService> | undefined>(
    undefined
  );

  const key =
    compilationResult?.type === "success" ? compilationResult.hash : "failure";
  useEffect(() => {
    const previewService = previewServiceRef.current;
    if (!previewService || compilationResult?.type !== "success") return;

    console.log(
      "editor: sending compilation result to preview %dms",
      Date.now() - compilationResult.timestamp
    );
    previewService.render(
      compilationResult.meta,
      transfer(compilationResult.codeBuffer, [compilationResult.codeBuffer]),
      compilationResult.hash,
      compilationResult.timestamp
    );
  }, [key]);

  return (
    <iframe
      ref={iframeRef}
      title="preview"
      src={`${PREVIEW_ORIGIN}/preview.html`}
      sandbox="allow-scripts allow-same-origin"
      onLoad={() => {
        if (!iframeRef.current || !iframeRef.current.contentWindow) {
          throw new Error("shouldn't happen");
        }

        const { port1, port2 } = new MessageChannel();

        port1.addEventListener("message", async ev => {
          if (ev.data !== "ready") return;

          const previewService = wrap<PreviewService>(port1);
          previewServiceRef.current = previewService;

          if (compilationResult?.type === "success") {
            previewService.render(
              compilationResult.meta,
              transfer(compilationResult.codeBuffer, [
                compilationResult.codeBuffer
              ]),
              compilationResult.hash,
              compilationResult.timestamp
            );
          }
        });
        port1.start();

        iframeRef.current.contentWindow.postMessage("init", "*", [port2]);
      }}
      style={{
        width: "100%",
        height: "100%",
        border: "2px solid black"
      }}
    />
  );
}
