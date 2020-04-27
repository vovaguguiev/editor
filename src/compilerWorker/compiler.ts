import { NodePath, ParserOptions, PluginObj, Visitor, transformSync } from "@babel/core";
import {
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    exportNamedDeclaration,
    exportDefaultDeclaration,
    identifier,
    callExpression,
    ImportDeclaration,
    ImportDefaultSpecifier,
    ImportNamespaceSpecifier,
    ImportSpecifier,
    isArrayPattern,
    isAssignmentPattern,
    isClassDeclaration,
    isExportDefaultSpecifier,
    isExportNamespaceSpecifier,
    isExportSpecifier,
    isFunctionDeclaration,
    isIdentifier,
    isImportNamespaceSpecifier,
    isImportSpecifier,
    isMemberExpression,
    isObjectPattern,
    isRestElement,
    isTSParameterProperty,
    isVariableDeclaration,
    memberExpression,
    objectPattern,
    objectProperty,
    stringLiteral,
    VariableDeclaration,
    variableDeclaration,
    variableDeclarator
} from "@babel/types";
import { absurd } from "../absurd";
import { assert } from "../assert";

interface BabelTypes {
    callExpression: typeof callExpression;
    identifier: typeof identifier;
    stringLiteral: typeof stringLiteral;
    exportNamedDeclaration: typeof exportNamedDeclaration;
    exportDefaultDeclaration: typeof exportDefaultDeclaration;
    memberExpression: typeof memberExpression;
    variableDeclaration: typeof variableDeclaration;
    variableDeclarator: typeof variableDeclarator;
}

export interface Meta {
    exportSpecifiers: string[];
    componentsBySpecifier: { [exportSpecifier: string]: string };
    localDependencies: string[];
}

export function compile(sourceCode: string, options: { fastRefresh: boolean }): { meta: Meta; code: string } {
    const plugins = [
        customCompilerPlugin,
        require("@babel/plugin-syntax-jsx").default,
        require("@babel/plugin-transform-react-jsx").default,
        require("@babel/plugin-transform-react-display-name").default,
        [require("@babel/plugin-transform-typescript").default, { isTSX: true }]
    ];
    if (options.fastRefresh) plugins.push([require("react-refresh/babel"), { skipEnvCheck: true }]);

    const result = transformSync(sourceCode, {
        babelrc: false,
        plugins
    });

    assert(result, "Transform didn't produce result");
    assert(result.metadata, "Missing result metadata");
    const resultMetadata = (result.metadata as unknown) as CustomCompilerPluginMetadata;

    const meta: Meta = {
        componentsBySpecifier: resultMetadata.customCompilerPlugin_componentsBySpecifier,
        exportSpecifiers: Array.from(resultMetadata.customCompilerPlugin_exportSpecifiersSet),
        localDependencies: Array.from(resultMetadata.customCompilerPlugin_localDependenciesSet)
    };
    const code = result.code || "";

    return { meta, code };
}

interface CustomCompilerPluginMetadata {
    customCompilerPlugin_componentsBySpecifier: { [exportSpecifier: string]: string };
    customCompilerPlugin_exportSpecifiersSet: Set<string>;
    customCompilerPlugin_localDependenciesSet: Set<string>;
}

const LOCAL_MODULES_RUNTIME_NAME = "__$LocalModulesLoader$__";

function customCompilerPlugin({
    types: t
}: {
    types: BabelTypes;
}): PluginObj<{ file: { metadata: CustomCompilerPluginMetadata } }> {
    return {
        manipulateOptions(opts: unknown, parserOpts: ParserOptions) {
            if (!parserOpts.plugins) parserOpts.plugins = [];
            parserOpts.plugins.push(
                "typescript",
                "jsx",
                "dynamicImport",
                "exportDefaultFrom",
                "exportNamespaceFrom",
                "importMeta"
            );
        },
        pre(state) {
            const initialMetadata: CustomCompilerPluginMetadata = {
                customCompilerPlugin_componentsBySpecifier: {},
                customCompilerPlugin_exportSpecifiersSet: new Set<string>(),
                customCompilerPlugin_localDependenciesSet: new Set<string>()
            };
            Object.assign(state.metadata, initialMetadata);
        },
        visitor: {
            ImportDeclaration(path: NodePath<ImportDeclaration>, { file: { metadata } }) {
                const moduleIdentifier = path.node.source.value;
                const importSpecifiers = path.node.specifiers;

                const isImportForSideEffect = importSpecifiers.length === 0;
                const isImportAll =
                    !isImportForSideEffect &&
                    importSpecifiers.every((s: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier) =>
                        isImportNamespaceSpecifier(s)
                    );

                if (moduleIdentifier.startsWith("./")) {
                    metadata.customCompilerPlugin_localDependenciesSet.add(moduleIdentifier);

                    if (isImportForSideEffect) {
                        // import "./foo" -> __$LocalModulesLoader$__("./foo")
                        path.replaceWith(
                            t.callExpression(t.identifier(LOCAL_MODULES_RUNTIME_NAME), [
                                stringLiteral(moduleIdentifier)
                            ])
                        );
                    } else if (isImportAll) {
                        // import * as Foo from "./foo" -> const Foo = __$LocalModulesLoader$__("./foo")
                        path.replaceWith(
                            variableDeclaration("const", [
                                variableDeclarator(
                                    identifier(importSpecifiers[0].local.name),
                                    t.callExpression(t.identifier(LOCAL_MODULES_RUNTIME_NAME), [
                                        stringLiteral(moduleIdentifier)
                                    ])
                                )
                            ])
                        );
                    } else {
                        // import Foo, { foo2 } from "./foo" -> const { default: Foo, foo2: foo2 } = __$LocalModulesLoader$__("./foo")
                        path.replaceWith(
                            variableDeclaration("const", [
                                variableDeclarator(
                                    objectPattern(
                                        importSpecifiers.map(s => {
                                            return objectProperty(
                                                identifier(isImportSpecifier(s) ? s.imported.name : "default"),
                                                identifier(s.local.name)
                                            );
                                        })
                                    ),
                                    t.callExpression(t.identifier(LOCAL_MODULES_RUNTIME_NAME), [
                                        stringLiteral(moduleIdentifier)
                                    ])
                                )
                            ])
                        );
                    }
                }

                if (moduleIdentifier === "react" || moduleIdentifier === "framer") {
                    const globalVariableNameId = identifier(moduleIdentifier === "react" ? "React" : "Framer");

                    if (isImportAll) {
                        // import * as React from "react" -> const React = window.React
                        const globalVarNameId = identifier(importSpecifiers[0].local.name);
                        path.replaceWith(
                            variableDeclaration("const", [
                                variableDeclarator(
                                    globalVarNameId,
                                    memberExpression(identifier("window"), globalVariableNameId)
                                )
                            ])
                        );
                    } else {
                        // import React, { useEffect } from "react" -> const { default: React, useEffect: useEffect } = window.React
                        path.replaceWith(
                            variableDeclaration("const", [
                                variableDeclarator(
                                    objectPattern(
                                        importSpecifiers.map(s => {
                                            return objectProperty(
                                                identifier(isImportSpecifier(s) ? s.imported.name : "default"),
                                                identifier(s.local.name)
                                            );
                                        })
                                    ),
                                    memberExpression(identifier("window"), globalVariableNameId)
                                )
                            ])
                        );
                    }
                }
            },
            ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>, { file: { metadata } }) {
                const { exportKind, specifiers, declaration, source } = path.node;
                const moduleIdentifier = source?.value;
                function isLocalModuleIdentifier(moduleIdentifier?: string): moduleIdentifier is string {
                    return moduleIdentifier ? moduleIdentifier.startsWith("./") : false;
                }

                if (isLocalModuleIdentifier(moduleIdentifier)) {
                    metadata.customCompilerPlugin_localDependenciesSet.add(moduleIdentifier);
                }

                // skip type exports
                if (exportKind === "type") return;

                // export function foo() {} or export const foo = 'foo'
                if (declaration) {
                    let componentNames;
                    if (isVariableDeclaration(declaration)) {
                        componentNames = getNamesFromVariableDeclaration(declaration);
                    } else {
                        componentNames = [declaration.id.name];
                    }

                    componentNames.forEach(c => metadata.customCompilerPlugin_exportSpecifiersSet.add(c));

                    if (isPotentiallyReactComponent(declaration)) {
                        metadata.customCompilerPlugin_componentsBySpecifier[componentNames[0]] = componentNames[0];
                    }
                    return;
                }

                const specifiersToReplace: [string, string][] = [];
                // export { foo as foo1, bar as default }
                for (const specifier of specifiers) {
                    if (isExportSpecifier(specifier)) {
                        const localName = specifier.local.name;
                        const exportedName = specifier.exported.name;
                        metadata.customCompilerPlugin_exportSpecifiersSet.add(exportedName);

                        if (isLocalModuleIdentifier(moduleIdentifier)) {
                            specifiersToReplace.push([exportedName, localName]);
                        }

                        if (!Array.isArray(path.container)) continue;
                        const declaration = path.container.find((sibling: any) => sibling?.id?.name === localName);
                        if (!isPotentiallyReactComponent(declaration)) continue;

                        metadata.customCompilerPlugin_componentsBySpecifier[exportedName] = localName;
                    } else if (isExportDefaultSpecifier(specifier)) {
                        // skip it, in practice, `export { foo as default }` ends up being ExportSpecifier
                        // so we are handling it in the corresponding if block
                    } else if (isExportNamespaceSpecifier(specifier)) {
                        // FIXME: support export * as Foo from "./foo"
                        metadata.customCompilerPlugin_exportSpecifiersSet.add(specifier.exported.name);
                        // Namespace cannot be a React component
                    } else {
                        absurd(specifier);
                    }
                }

                // export { foo as foo1, bar as default } from "./foo"
                if (specifiersToReplace.length > 0) {
                    path.replaceWithMultiple(
                        specifiersToReplace.map(([exportedName, localName]) => {
                            if (exportedName === "default") {
                                // export default __$LocalModulesLoader$__("./foo").bar
                                return t.exportDefaultDeclaration(
                                    t.memberExpression(
                                        t.callExpression(t.identifier(LOCAL_MODULES_RUNTIME_NAME), [
                                            t.stringLiteral(moduleIdentifier!)
                                        ]),
                                        t.identifier(localName)
                                    )
                                );
                            }

                            // export const foo1 = __$LocalModulesLoader$__("./foo")
                            return t.exportNamedDeclaration(
                                t.variableDeclaration("const", [
                                    t.variableDeclarator(
                                        t.identifier(exportedName),
                                        t.memberExpression(
                                            t.callExpression(t.identifier(LOCAL_MODULES_RUNTIME_NAME), [
                                                t.stringLiteral(moduleIdentifier!)
                                            ]),
                                            t.identifier(localName)
                                        )
                                    )
                                ])
                            );
                        })
                    );
                }
            },
            ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>, { file: { metadata } }) {
                const { declaration } = path.node;

                if (isFunctionDeclaration(declaration) || isClassDeclaration(declaration)) {
                    metadata.customCompilerPlugin_exportSpecifiersSet.add("default");
                    metadata.customCompilerPlugin_componentsBySpecifier["default"] = declaration.id.name;
                }
            }
        } as Visitor<{ file: { metadata: CustomCompilerPluginMetadata } }>
    };
}

// FIXME: improve detection
function isPotentiallyReactComponent(declaration: any): boolean {
    return isFunctionDeclaration(declaration) || isClassDeclaration(declaration);
}

function getNamesFromVariableDeclaration(varDeclaration: VariableDeclaration): string[] {
    return varDeclaration.declarations.reduce((result: string[], declarator) => {
        const { id } = declarator;

        if (isIdentifier(id)) {
            result.push(id.name);
        } else if (isMemberExpression(id)) {
            // FIXME: what would be an example of this?
            // NOT IMPLEMENTED
        } else if (isArrayPattern(id)) {
            // const [foo, bar] = [1, 2]
            // NOT IMPLEMENTED
        } else if (isObjectPattern(id)) {
            // const { foo, bar } = { foo: 1, bar: 2 }
            // NOT IMPLEMENTED
        } else if (isRestElement(id)) {
            // FIXME: what would be an example of this?
            // NOT IMPLEMENTED
        } else if (isAssignmentPattern(id)) {
            // FIXME: what would be an example of this?
            // NOT IMPLEMENTED
        } else if (isTSParameterProperty(id)) {
            // FIXME: what would be an example of this?
            // NOT IMPLEMENTED
        } else {
            absurd(id);
        }

        return result;
    }, []);
}
