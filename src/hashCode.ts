export function hashCode(s: string): number {
    let hash = 0;
    if (s.length === 0) return hash;
    for (let i = 0, il = s.length; i < il; i++) {
        const char = s.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0;
    }
    return hash;
}
