export function absurd(x: never): never {
    throw new TypeError("Absurd, this should never happen");
}
