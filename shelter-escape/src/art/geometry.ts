/**
 * SVG パス生成の下請け。
 *
 * 方針：輪郭は「解剖学的ランドマーク（点）」から機械的に生成する。
 * 手描きのパスを段階ごとに用意すると必ずどこかで破綻するので、
 * 点の位置と太さだけをパラメータにして、曲線生成はここに集約する。
 */

export type Pt = readonly [number, number];

function n(v: number): string {
  return Math.abs(v) < 1e-4 ? '0' : String(Math.round(v * 100) / 100);
}

function catmullRomAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
  const y =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  return [x, y];
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[Math.min(Math.max(i, 0), arr.length - 1)];
  if (v === undefined) throw new Error('空の配列');
  return v;
}

function wrapAt<T>(arr: readonly T[], i: number): T {
  const len = arr.length;
  const v = arr[((i % len) + len) % len];
  if (v === undefined) throw new Error('空の配列');
  return v;
}

/** 閉じた滑らかな輪郭（Catmull-Rom → 3次ベジエ） */
export function closedSpline(points: readonly Pt[], tension = 1): string {
  if (points.length < 3) throw new Error('点が足りない');
  const k = tension / 6;
  const first = wrapAt(points, 0);
  let d = `M ${n(first[0])} ${n(first[1])}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = wrapAt(points, i - 1);
    const p1 = wrapAt(points, i);
    const p2 = wrapAt(points, i + 1);
    const p3 = wrapAt(points, i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C ${n(c1[0])} ${n(c1[1])}, ${n(c2[0])} ${n(c2[1])}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d} Z`;
}

/** 開いた滑らかな線（端点は通過する） */
export function openSpline(points: readonly Pt[], tension = 1): string {
  if (points.length < 2) throw new Error('点が足りない');
  const k = tension / 6;
  const first = at(points, 0);
  let d = `M ${n(first[0])} ${n(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(points, i - 1);
    const p1 = at(points, i);
    const p2 = at(points, i + 1);
    const p3 = at(points, i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C ${n(c1[0])} ${n(c1[1])}, ${n(c2[0])} ${n(c2[1])}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** 中心線をサンプリングする（半径も一緒に補間する） */
function sampleSpine(
  spine: readonly Pt[],
  radii: readonly number[],
  steps: number,
): { c: Pt; r: number }[] {
  const out: { c: Pt; r: number }[] = [];
  for (let i = 0; i < spine.length - 1; i++) {
    const p0 = at(spine, i - 1);
    const p1 = at(spine, i);
    const p2 = at(spine, i + 1);
    const p3 = at(spine, i + 2);
    const r1 = at(radii, i);
    const r2 = at(radii, i + 1);
    const last = i === spine.length - 2;
    const n1 = last ? steps : steps - 1;
    for (let s = 0; s <= n1; s++) {
      const t = s / steps;
      const c = catmullRomAt(p0, p1, p2, p3, t);
      // 半径はスプライン補間するとオーバーシュートして輪郭が波打つので、
      // 節点で微分0になる smoothstep で繋ぐ（節点の値を超えない）
      const e = t * t * (3 - 2 * t);
      const rr = r1 + (r2 - r1) * e;
      out.push({ c, r: Math.max(rr, 0.5) });
    }
  }
  return out;
}

export interface LimbOptions {
  /** 末端を丸める（手・足先） */
  roundEnd?: boolean;
  /** 始端を丸める（肩など、切り口が silhouette の外に出る場合） */
  roundStart?: boolean;
  /** 分割数 */
  steps?: number;
}

/**
 * 中心線 + 各節点の半径から四肢の輪郭を作る。
 * 関節位置（spine）は段階が変わっても動かさず、半径だけを太らせる。
 * これで「肘が消える」「腕がねじれる」といった破綻が構造的に起きない。
 */
export function limbOutline(
  spine: readonly Pt[],
  radii: readonly number[],
  options: LimbOptions = {},
): string {
  if (spine.length !== radii.length) throw new Error('spine と radii の長さが違う');
  const steps = options.steps ?? 22;
  const samples = sampleSpine(spine, radii, steps);

  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < samples.length; i++) {
    const cur = at(samples, i);
    const prev = at(samples, Math.max(i - 1, 0));
    const next = at(samples, Math.min(i + 1, samples.length - 1));
    let tx = next.c[0] - prev.c[0];
    let ty = next.c[1] - prev.c[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    left.push([cur.c[0] + nx * cur.r, cur.c[1] + ny * cur.r]);
    right.push([cur.c[0] - nx * cur.r, cur.c[1] - ny * cur.r]);
  }

  const tail = at(samples, samples.length - 1);
  let d = `M ${n(at(left, 0)[0])} ${n(at(left, 0)[1])}`;
  for (let i = 1; i < left.length; i++) {
    const p = at(left, i);
    d += ` L ${n(p[0])} ${n(p[1])}`;
  }
  if (options.roundEnd ?? true) {
    const b = at(right, right.length - 1);
    d += ` A ${n(tail.r)} ${n(tail.r)} 0 0 1 ${n(b[0])} ${n(b[1])}`;
  } else {
    const b = at(right, right.length - 1);
    d += ` L ${n(b[0])} ${n(b[1])}`;
  }
  const stop = options.roundStart ?? false ? 1 : 0;
  for (let i = right.length - 2; i >= stop; i--) {
    const p = at(right, i);
    d += ` L ${n(p[0])} ${n(p[1])}`;
  }
  if (options.roundStart ?? false) {
    const head = at(samples, 0);
    const a = at(left, 0);
    // 始端は進行方向と逆向きに回すので sweep は 0（1 にすると内側を抉って三日月が出る）
    d += ` A ${n(head.r)} ${n(head.r)} 0 0 0 ${n(a[0])} ${n(a[1])}`;
  }
  return `${d} Z`;
}

/** 中心線そのもの（陰影ラインなどに使う） */
export function spineLine(spine: readonly Pt[]): string {
  return openSpline(spine);
}

export function mirrorX(points: readonly Pt[]): Pt[] {
  return points.map(([x, y]) => [-x, y] as Pt);
}
