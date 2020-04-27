import { assert } from "./assert";
import { absurd } from "./absurd";
import { useCallback, useReducer } from "react";

const initialIndexCode = `import * as React from 'react'
import { useState } from 'react'
import random from "https://unpkg.com/lodash-es/random"
import { Button, primary } from "./Button.js"

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
            <Button
                color={primary}
                onClick={() => { setNumber(random(1, 100)) }}
            >
                Click to get your lucky number
            </Button>
        </div>
    )
}
`;
const initialButtonCode = `import * as React from "react"
import { ReactNode } from "react"
export { primary } from "./colors.js"

interface Props { 
    children: ReactNode;
    onClick: (event: MouseEvent) => void;
}

export function Button({ color, children, onClick }: Props) {
    return (
        <button
            style={{
                backgroundColor: color ?? "pink",
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
}`;

const initialColorsCode = `export const primary = "plum"
export const secondary = "salmon"
`;

interface File {
    name: string;
    text: string;
}
interface FilesState {
    files: { [fileName: string]: File }; // TODO: add lastModified?
    selectedFileName: string;
}

type FilesAction = { type: "add"; name: string; text: string } | { type: "setSelected"; name: string };

function filesReducer(state: FilesState, action: FilesAction): FilesState {
    switch (action.type) {
        case "add":
            assert(!state.files[action.name], `Failed to add new file, ${action.name} already exists`);
            return {
                ...state,
                files: {
                    ...state.files,
                    [action.name]: { name: action.name, text: action.text }
                },
                selectedFileName: action.name
            };

        case "setSelected":
            assert(state.files[action.name], `Failed to select non-existent file ${action.name}`);
            if (state.selectedFileName === action.name) return state;
            return {
                ...state,
                selectedFileName: action.name
            };

        default:
            return absurd(action);
    }
}

export function useFiles(): {
    files: Readonly<{ [fileName: string]: Readonly<File> }>;
    selectedFile: Readonly<File>;
    add: (name: string, text: string) => void;
    setText: (name: string, text: string) => void;
    setSelected: (name: string) => void;
} {
    const [state, dispatch] = useReducer(filesReducer, {
        files: {
            "index.js": { name: "index.js", text: initialIndexCode },
            "Button.js": { name: "Button.js", text: initialButtonCode },
            "colors.js": { name: "colors.js", text: initialColorsCode }
        },
        selectedFileName: "index.js"
    });
    const add = useCallback(
        (name: string, text: string) => {
            dispatch({ type: "add", name, text });
        },
        [dispatch]
    );
    const setText = (name: string, text: string) => {
        // This function doesn't dispatch, instead it synchronously modifies file content to avoid re-render ans stale reads
        assert(state.files[name], `Failed to set text for non-existent file ${name}`);
        state.files[name].text = text;
    };
    const setSelected = useCallback(
        (name: string) => {
            dispatch({ type: "setSelected", name });
        },
        [dispatch]
    );

    return { files: state.files, selectedFile: state.files[state.selectedFileName], add, setText, setSelected };
}
