/** Four disjoint drawing sets color the cylindrical tile grid. Every touching
 * tile (including diagonals and the wrap seam) has a different set. */
const ORDER = [0, 21, 12, 7, 20, 33, 16, 9, 27, 24,
  4, 22, 14, 6, 11, 32, 17, 8, 28, 25,
  18, 31, 13, 2, 10, 34, 38, 30, 26, 19,
  36, 15, 5, 3, 23, 35, 37, 29, 39, 1] as const;
const mod = (n: number, m: number) => ((n % m) + m) % m;
function tileHash(sector: number, row: number): number {
  let h = (Math.imul(sector + 1, 374761393) + Math.imul(row, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** The CPU reference is used to verify spatial constraints over long passages. */
export function drawingKinds(x: number, y: number, variety = 1): number[] {
  const sector = mod(x, 8), row = y + Math.floor(x / 8);
  const group = mod(sector, 2) + 2 * mod(row, 2);
  const count = 5 + Math.floor(Math.max(0, Math.min(1, variety)) * 5);
  const h = tileHash(sector, row), start = h % count;
  const step = (h & 1) ? 1 : count - 1;
  return [0, 1, 2].map(slot => ORDER[group * 10 + (start + slot * step) % count]!);
}
export const DRAWING_LAYOUT = `
const int drawingOrder[40]=int[40](${ORDER.join(',')});
float drawingKind(vec2 tile,int slot,float variety) {
  int sector=int(mod(tile.x,8.0));
  int row=int(tile.y+floor(tile.x/8.0));
  int group=sector%2+2*int(mod(float(row),2.0));
  uint h=uint(sector+1)*374761393u+uint(row)*668265263u;
  h=(h^(h>>13u))*1274126177u; h=h^(h>>16u);
  int count=5+int(floor(clamp(variety,0.0,1.0)*5.0));
  int start=int(h%uint(count)),stride=(h&1u)==1u?1:count-1;
  return float(drawingOrder[group*10+(start+slot*stride)%count]);
}
`;
