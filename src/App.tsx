import React, { useEffect, useRef } from "react";
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
        <>
            <button
                style={{
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
            <h2>Your lucky number is: {number}</h2>
        </>
    )
}
`;

export default function App() {
  const codeRef = useRef<HTMLElement>(null);
  usePreventSave();
  const { result, compile } = useCompiler(initialSourceCode);

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
            compile(e.currentTarget.innerText, Date.now());
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
        <PreviewFrame compilationResult={result} />
      </div>
    </div>
  );
}
