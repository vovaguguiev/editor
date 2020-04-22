import { NodePath, ParserOptions, transform } from "@babel/core";
import {
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    identifier,
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
    VariableDeclaration,
    variableDeclaration,
    variableDeclarator
} from "@babel/types";

export interface Meta {
    exportSpecifiers: string[];
    componentsBySpecifier: { [exportSpecifier: string]: string };
    localDependencies: string[];
}

export function compile(sourceCode: string, options: { fastRefresh: boolean }): { meta: Meta; code: string } {
    const meta: Meta = {
        exportSpecifiers: [],
        componentsBySpecifier: {},
        localDependencies: []
    };
    const localDependenciesSet = new Set<string>();

    const plugins = [
        {
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
            visitor: {
                ImportDeclaration(path: NodePath<ImportDeclaration>) {
                    const moduleIdentifier = path.node.source.value;

                    if (moduleIdentifier.startsWith("./")) {
                        localDependenciesSet.add(moduleIdentifier);
                    }

                    if (moduleIdentifier === "react" || moduleIdentifier === "framer") {
                        const importSpecifiers = path.node.specifiers;

                        const isImportAll = importSpecifiers.every(
                            (s: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier) =>
                                isImportNamespaceSpecifier(s)
                        );

                        const globalVariableNameId = identifier(moduleIdentifier === "react" ? "React" : "Framer");

                        if (isImportAll) {
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
                ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
                    const { exportKind, specifiers, declaration, source } = path.node;

                    if (source?.value.startsWith("./")) {
                        localDependenciesSet.add(source.value);
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

                        meta.exportSpecifiers.push(...componentNames);

                        if (isPotentiallyReactComponent(declaration)) {
                            meta.componentsBySpecifier[componentNames[0]] = componentNames[0];
                        }
                        return;
                    }

                    // export { foo as foo1, bar as default }
                    for (const specifier of specifiers) {
                        if (isExportSpecifier(specifier)) {
                            const localName = specifier.local.name;
                            const exportedName = specifier.exported.name;
                            meta.exportSpecifiers.push(exportedName);
                            if (!Array.isArray(path.container)) continue;

                            const declaration = path.container.find((sibling: any) => sibling?.id?.name === localName);
                            if (!isPotentiallyReactComponent(declaration)) continue;

                            meta.componentsBySpecifier[exportedName] = localName;
                        } else if (isExportDefaultSpecifier(specifier)) {
                            // skip it, in practice, `export { foo as default }` ends up being ExportSpecifier
                            // so we are handling it in the corresponding if block
                        } else if (isExportNamespaceSpecifier(specifier)) {
                            meta.exportSpecifiers.push(specifier.exported.name);
                            // Namespace cannot be a React component
                        } else {
                            absurd(specifier);
                        }
                    }
                },
                ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
                    const { declaration } = path.node;

                    if (isFunctionDeclaration(declaration) || isClassDeclaration(declaration)) {
                        meta.exportSpecifiers.push("default");
                        meta.componentsBySpecifier["default"] = declaration.id.name;
                    }
                }
            }
        },
        require("@babel/plugin-syntax-jsx").default,
        require("@babel/plugin-transform-react-jsx").default,
        require("@babel/plugin-transform-react-display-name").default,
        [require("@babel/plugin-transform-typescript").default, { isTSX: true }]
    ];
    if (options.fastRefresh) plugins.push([require("react-refresh/babel"), { skipEnvCheck: true }]);

    const compiledCode = transform(sourceCode, {
        babelrc: false,
        plugins
    })?.code;

    // assert(compiledCode, "Transform didn't produce any code");

    meta.localDependencies = Array.from(localDependenciesSet);

    return { meta, code: compiledCode || "" };
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

function assert(condition: unknown, msg?: string): asserts condition {
    if (!condition) {
        throw new Error(msg ? `assert: ${msg}` : "assert");
    }
}

function absurd(x: never): never {
    throw new TypeError("Absurd, this should never happen");
}
