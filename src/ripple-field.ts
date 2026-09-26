export const FIELD_WIDTH = 128;
export const FIELD_BUCKETS = 12;
// The same three log-frequency regions used by the visual response analyzer.
export const FIELD_RANGES = [[5, 44], [44, 89], [89, 125]] as const;
const clean = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
/** A circular bank of smooth excitation sites, driven ONLY by spectral energy.
 * Frequency buckets have fixed, reproducible spatial addresses. Different notes
 * therefore sculpt different parts of the surface, not a randomly shuffled shape.
 * Low frequencies spread widely; higher frequencies create narrower features.
 * There is no free-running shape oscillator or volume-derived canned flower. */
const kernels = FIELD_RANGES.map((_, band) => {
    const width = [0.90, 0.56, 0.34][band]!;
    return Array.from({ length: FIELD_WIDTH }, (_, angle) => {
        const theta = 2 * Math.PI * angle / FIELD_WIDTH;
        const weights = Array.from({ length: FIELD_BUCKETS }, (_, bucket) => {
            const site = bucket * 2.399963229728653 + band * 1.137;
            const d = Math.atan2(Math.sin(theta - site), Math.cos(theta - site));
            return Math.exp(-0.5 * (d / width) ** 2);
        });
        const sum = weights.reduce((a, b) => a + b, 0);
        return weights.map(w => w / sum);
    });
});
export function spectralBuckets(spectrum: ArrayLike<number>): Float32Array[] {
    return FIELD_RANGES.map(([lo, hi]) => {
        const result = new Float32Array(FIELD_BUCKETS);
        for (let j = 0; j < FIELD_BUCKETS; j++) {
            const a = lo + Math.floor(j * (hi - lo) / FIELD_BUCKETS);
            const b = lo + Math.floor((j + 1) * (hi - lo) / FIELD_BUCKETS);
            let power = 0;
            for (let i = a; i < b; i++)
                power += clean(spectrum[i] ?? 0) ** 2;
            result[j] = Math.sqrt(power / Math.max(1, b - a));
        }
        return result;
    });
}
/** Returns three independent angular height fields in a floating-point RGBA row. The
 * renderer stores these in history, so already-emitted ridges keep their shape. */
export function makeRippleField(spectrum: ArrayLike<number>, gain = 1, out = new Float32Array(FIELD_WIDTH * 4)): Float32Array {
    const buckets = spectralBuckets(spectrum);
    const scale = Number.isFinite(gain) ? Math.max(0, Math.min(2, gain)) : 1;
    const means = buckets.map(b => b.reduce((sum, n) => sum + n, 0) / FIELD_BUCKETS);
    const center = (means[0]! * 1.18 + means[1]! * 0.80 + means[2]! * 0.27) * scale;
    for (let a = 0; a < FIELD_WIDTH; a++) {
        for (let band = 0; band < 3; band++) {
            let value = 0;
            for (let j = 0; j < FIELD_BUCKETS; j++)
                value += kernels[band]![a]![j]! * buckets[band]![j]!;
            out[a * 4 + band] = clean(value * scale);
        }
        out[a * 4 + 3] = center;
    }
    return out;
}
