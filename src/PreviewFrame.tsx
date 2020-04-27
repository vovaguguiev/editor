import React, { useEffect, useRef, useState } from "react";
import { wrap, Remote } from "comlink";
import { Module, PreviewData } from "./useCompiler";
import { PREVIEW_ORIGIN } from "./config";

type PreviewService = {
    render: (
        previewInfo: { path: string; componentSpecifier: string },
        modules: { [path: string]: Module },
        timestamp: number
    ) => void;
};

export function PreviewFrame({ previewData }: { previewData: PreviewData | undefined }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [previewService, setPreviewService] = useState<Remote<PreviewService> | undefined>(undefined);

    const key = previewData?.type === "componentData" ? previewData.modules[previewData.path].hash : "failure";
    useEffect(() => {
        if (!previewService || previewData?.type !== "componentData") return;

        console.log("editor: sending compilation result to preview %dms", Date.now() - previewData.timestamp);
        previewService.render(
            { path: previewData.path, componentSpecifier: previewData.componentSpecifier },
            previewData.modules,
            previewData.timestamp
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewService, key]);

    return (
        <iframe
            ref={iframeRef}
            title="preview"
            src={`${PREVIEW_ORIGIN}/preview.html`}
            sandbox="allow-scripts allow-same-origin allow-modals"
            onLoad={() => {
                if (!iframeRef.current || !iframeRef.current.contentWindow) {
                    throw new Error("shouldn't happen");
                }

                const { port1, port2 } = new MessageChannel();

                port1.addEventListener("message", async ev => {
                    if (ev.data !== "ready") return;

                    const service = wrap<PreviewService>(port1);
                    setPreviewService(() => service);

                    if (previewData?.type === "componentData") {
                        service.render(
                            { path: previewData.path, componentSpecifier: previewData.componentSpecifier },
                            previewData.modules,
                            previewData.timestamp
                        );
                    }
                });
                port1.start();

                iframeRef.current.contentWindow.postMessage("init", "*", [port2]);
            }}
            style={{
                width: "100%",
                height: "calc(100% - 30px)",
                border: "2px solid black"
            }}
        />
    );
}
