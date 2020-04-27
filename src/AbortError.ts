export class AbortError extends Error {
    constructor(public readonly reason?: string) {
        super("AbortError");
    }
}
