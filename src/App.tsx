import React, { useEffect, useRef, useState } from "react";
import { useCompiler } from "./useCompiler";
import { usePreventSave } from "./usePreventSave";
import { PreviewFrame } from "./PreviewFrame";

const initialSourceCode = `import * as React from 'react'
import { useState } from 'react'
import random from "https://unpkg.com/lodash-es/random"

export function Foo() {
    const [number, setNumber] = useState(undefined)

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
            }}
        >
            <h2
                style={{ opacity: number != null ? 1 : 0 }}>Your lucky number is</h2>
            <h1 style={{ opacity: number != null ? 1 : 0 }}>{number != null ? number : "00"}</h1>
            <button
                style={{
                    marginTop: 20,
                    backgroundColor: "plum",
                    border: "2px solid black",
                    borderRadius: '8px',
                    height: 40,
                    fontSize: 16
                }}
                onClick={() => { setNumber(random(1, 100)) }}
            >
                Click to get your lucky number
            </button>
        </div>
    )
}
`;
const initialButtonCode = `import * as React from "react"
import { ReactNode } from "react"

interface Props { 
    children: ReactNode;
    onClick: (event: MouseEvent) => void;
}

export function Button({ children, onClick }: Props) {
    return (
        <button
            style={{
                backgroundColor: "plum",
                border: "2px solid black",
                borderRadius: '8px',
                height: 40,
                fontSize: 16
            }}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

Button.defaultProps = {
    children: "🥑 Avocado",
    onClick() { alert("Click!") }
}
`;

export default function App() {
    const codeRef = useRef<HTMLElement>(null);

    const [fastRefreshEnabled, setFastRefreshEnabled] = useState(true);

    const { result, compile } = useCompiler(fastRefreshEnabled, initialSourceCode);

    usePreventSave();

    const [files, setFiles] = useState<{ [fileName: string]: { text: string } }>({
        "index.js": { text: initialSourceCode },
        "Button.js": { text: initialButtonCode }
    });
    const [selectedFileName, setSelectedFileName] = useState<string>("index.js");
    const selectedFile = files[selectedFileName];
    // Replace the content of the editor when selecting a different file
    useEffect(() => {
        if (!codeRef.current) return;
        codeRef.current.innerText = selectedFile.text;
        compile(selectedFile.text, Date.now(), fastRefreshEnabled);
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
                    width: "150px",
                    height: "100%",
                    padding: "20px 0",
                    boxSizing: "border-box",
                    background: "white",
                    borderRight: "1px solid white"
                }}
            >
                <h3
                    style={{
                        marginTop: 0,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingLeft: 10
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
                            setFiles(files => {
                                return {
                                    ...files,
                                    [fileName]: { text: "" }
                                };
                            });
                            setSelectedFileName(fileName);
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
                                        fileName === selectedFileName ? "3px solid plum" : "3px solid transparent",
                                    background: fileName === selectedFileName ? "lavender" : "transparent"
                                }}
                                onClick={() => setSelectedFileName(fileName)}
                            >
                                {fileName}
                            </li>
                        ))}
                </ul>
            </div>
            <div
                style={{
                    width: "calc(50% - 75px)",
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
                        console.log("----");
                        console.log("editor: sending code to worker");
                        selectedFile.text = code;
                        compile(code, Date.now(), fastRefreshEnabled);
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
                    width: "calc(50% - 75px)",
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
                            if (checked && codeRef.current && codeRef.current.innerText) {
                                compile(codeRef.current.innerText, Date.now(), true);
                            }
                        }}
                    />
                </div>
                <PreviewFrame compilationResult={result} />
            </div>
        </div>
    );
}
