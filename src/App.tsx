import React, { useEffect, useRef, useState } from "react";
import { useCompiler } from "./useCompiler";
import { usePreventSave } from "./usePreventSave";
import { PreviewFrame } from "./PreviewFrame";

const initialSourceCode = `
import * as React from 'react'
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
                    backgroundColor: "salmon",
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

export default function App() {
    const codeRef = useRef<HTMLElement>(null);
    const [fastRefreshEnabled, setFastRefreshEnabled] = useState(true);

    usePreventSave();
    const { result, compile } = useCompiler(fastRefreshEnabled, initialSourceCode);

    // set the initial content of the code editor
    useEffect(() => {
        if (!codeRef.current || !initialSourceCode) return;
        codeRef.current.innerText = initialSourceCode;
    }, []);

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
                    width: "50%",
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
                        if (!e.currentTarget.innerText) return;
                        console.log("----");
                        console.log("editor: sending code to worker");
                        compile(e.currentTarget.innerText, Date.now(), fastRefreshEnabled);
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
                    width: "50%",
                    padding: 20,
                    height: "100%",
                    boxSizing: "border-box",
                    backgroundColor: "white"
                }}
            >
                <div style={{ textAlign: "right", fontSize: 20, marginBottom: 10 }}>
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
