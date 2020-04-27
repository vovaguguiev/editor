import React, { useEffect, useRef, useState } from "react";
import { getPreviewData, PreviewData } from "./useCompiler";
import { usePreventSave } from "./usePreventSave";
import { PreviewFrame } from "./PreviewFrame";
import { useFiles } from "./useFiles";
import { AbortError } from "./AbortError";

export default function App() {
    const codeRef = useRef<HTMLElement>(null);
    const compilationControllerRef = useRef<AbortController | undefined>(undefined);
    const [previewData, setPreviewData] = useState<PreviewData | undefined>(undefined);

    const [fastRefreshEnabled, setFastRefreshEnabled] = useState(true);

    usePreventSave();

    const { files, selectedFile, add, setText, setSelected } = useFiles();
    function readFile(path: string): string | undefined {
        return files[path]?.text;
    }

    // Replace the content of the editor and compile code when selecting a file
    useEffect(() => {
        if (!codeRef.current) return;
        codeRef.current.innerText = selectedFile.text;

        if (compilationControllerRef.current) {
            compilationControllerRef.current.abort();
        }
        compilationControllerRef.current = new AbortController();
        getPreviewData({
            path: selectedFile.name,
            readFile,
            fastRefresh: fastRefreshEnabled,
            timestamp: Date.now(),
            signal: compilationControllerRef.current.signal
        }).then(
            r => {
                setPreviewData(r);
            },
            err => {
                if (err instanceof AbortError) {
                    console.warn("editor: getPreviewData aborted");
                    return;
                }
                throw err;
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    return (
        <div
            style={{
                height: "100vh",
                display: "flex",
                alignItems: "center",
                backgroundColor: "black"
            }}
        >
            <div
                style={{
                    width: "200px",
                    height: "100%",
                    boxSizing: "border-box",
                    background: "white"
                }}
            >
                <h3
                    style={{
                        marginTop: 0,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 0 10px 10px",
                        borderBottom: "2px solid black"
                    }}
                >
                    Files{" "}
                    <button
                        style={{ background: "none", border: "none", fontSize: 18, fontWeight: "bold" }}
                        onClick={() => {
                            const fileName = prompt("Provide a file name");
                            if (!fileName) return;
                            if (files[fileName]) {
                                alert(`${fileName} already exists`);
                                return;
                            }
                            add(fileName, "");
                        }}
                    >
                        ＋
                    </button>
                </h3>
                <ul style={{ display: "flex", flexDirection: "column" }}>
                    {Object.keys(files)
                        .sort()
                        .map(fileName => (
                            <li
                                key={fileName}
                                style={{
                                    padding: "6px 10px",
                                    userSelect: "none",
                                    fontSize: "14px",
                                    borderLeft:
                                        fileName === selectedFile.name ? "3px solid gray" : "3px solid transparent",
                                    background: fileName === selectedFile.name ? "#ececec" : "transparent"
                                }}
                                onClick={() => setSelected(fileName)}
                            >
                                {fileName}
                            </li>
                        ))}
                </ul>
            </div>
            <div
                style={{
                    width: "calc(50% - 50px)",
                    height: "100%",
                    padding: 20,
                    boxSizing: "border-box"
                }}
            >
                <code
                    ref={codeRef}
                    contentEditable
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "block",
                        color: "white",
                        outline: "none",
                        whiteSpace: "pre-wrap"
                    }}
                    onInput={e => {
                        const code = e.currentTarget.innerText;
                        if (!code) return;
                        setText(selectedFile.name, code);

                        console.log("----");
                        console.log("editor: sending code to worker");
                        if (compilationControllerRef.current) {
                            compilationControllerRef.current.abort();
                        }
                        compilationControllerRef.current = new AbortController();
                        getPreviewData({
                            path: selectedFile.name,
                            readFile,
                            fastRefresh: fastRefreshEnabled,
                            timestamp: Date.now(),
                            signal: compilationControllerRef.current.signal
                        }).then(
                            r => {
                                setPreviewData(r);
                            },
                            err => {
                                if (err instanceof AbortError) {
                                    console.warn("editor: getPreviewData aborted");
                                    return;
                                }
                                throw err;
                            }
                        );
                    }}
                    onKeyDown={e => {
                        if (e.key !== "Tab") return;
                        e.preventDefault();
                        document.execCommand("insertText", false, "    ");
                    }}
                />
            </div>
            <div
                style={{
                    width: "calc(50% - 150px)",
                    padding: 20,
                    height: "100%",
                    boxSizing: "border-box",
                    backgroundColor: "white"
                }}
            >
                <div style={{ textAlign: "right", fontSize: 18, marginBottom: 10 }}>
                    <label htmlFor="fast-refresh" style={{ userSelect: "none" }}>
                        Fast Refresh™️
                    </label>
                    <input
                        type="checkbox"
                        id="fast-refresh"
                        checked={fastRefreshEnabled}
                        onChange={event => {
                            const checked = event.currentTarget.checked;
                            setFastRefreshEnabled(checked);

                            // If we enable Fast Refresh we need to recompile the existing code,
                            // so babel inserts necessary instrumentation
                            if (checked) {
                                if (compilationControllerRef.current) {
                                    compilationControllerRef.current.abort();
                                }
                                compilationControllerRef.current = new AbortController();
                                getPreviewData({
                                    path: selectedFile.name,
                                    readFile,
                                    fastRefresh: true,
                                    timestamp: Date.now(),
                                    signal: compilationControllerRef.current.signal
                                }).then(
                                    r => {
                                        setPreviewData(r);
                                    },
                                    err => {
                                        if (err instanceof AbortError) {
                                            console.warn("editor: getPreviewData aborted");
                                            return;
                                        }
                                        throw err;
                                    }
                                );
                            }
                        }}
                    />
                </div>
                <PreviewFrame previewData={previewData} />
            </div>
        </div>
    );
}
