export function absolutePath(baseAbsolutePath: string, relativePath: string): string {
    const url = new URL(relativePath, `https://example.com/${baseAbsolutePath}`);
    // remove leading slash
    return url.pathname.substring(1);
}
