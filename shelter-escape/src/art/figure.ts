import type { Stage } from '../game/types';
import { closedSpline, limbOutline, openSpline, type Pt } from './geometry';
import { physiqueOf, type Physique } from './physique';

/**
 * 骨格。全段階で共通。ここは絶対に段階で変えない。
 * 頭高を100とした 7.5 頭身（全高750）。関節位置は標準的な人体比率に合わせてある。
 *   肘＝臍の高さ / 手首＝股下の高さ / 股下＝全高の中央 / 膝＝股下と踵の中間
 */
export const SK = {
  height: 750,
  chinY: 100,
  craniumHalf: 32, // 頭幅/頭高 = 14.1cm/22cm。太っても変わらない
  neckTopY: 86,
  neckBaseY: 150,
  acromionX: 66, // 肩峰。女性の肩峰幅 36cm に対応
  acromionY: 168,
  shoulderJointX: 56, // 上腕の回転中心。三角筋の外縁が肩幅を決める
  shoulderJointY: 192,
  nippleY: 228, // 乳頭高（女性）
  armpitY: 236,
  ribY: 300,
  waistY: 316, // 女性のウエストは男性よりやや高い
  crestY: 352,
  crotchY: 378,
  trochY: 392,
  elbowY: 328,
  wristY: 394,
  fingerY: 468,
  hipJointX: 42, // 骨盤が広いぶん股関節の間隔も広い
  hipJointY: 350,
  kneeY: 552,
  calfY: 610,
  ankleY: 714,
  soleY: 750,
} as const;

export interface Shade {
  d: string;
  blur: number;
  opacity: number;
  stroke?: number;
}

export interface Lobe {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity: number;
}

export interface FigureGeometry {
  physique: Physique;
  parts: {
    legs: string[];
    feet: string[];
    torso: string;
    neck: string;
    head: string;
    hair: string;
    hairTail: string;
    arms: string[];
    hands: string[];
  };
  clothes: {
    trousers: string;
    boots: string[];
    shirt: string;
    shirtSleeves: string[];
    jacket: string[];
    jacketSleeves: string[];
    collar: string;
    belt: string;
  };
  /** 陰影（暗い側）。ぼかして重ねる */
  occlusion: Shade[];
  /** 面の張り出し（明るい側）。腹や胸の丸みを出す */
  highlights: Lobe[];
  contact: { cx: number; cy: number; rx: number; ry: number };
}

const DEG = Math.PI / 180;

function rotPt(p: Pt, deg: number, pivot: Pt): Pt {
  const a = deg * DEG;
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  return [pivot[0] + dx * Math.cos(a) - dy * Math.sin(a), pivot[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** 右側輪郭の (y, halfWidth) 表。腕を体幹の外へ逃がすのに使う */
type Profile = { y: number; half: number }[];

function halfAt(profile: Profile, y: number): number {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 0;
  if (y <= first.y) return first.half;
  if (y >= last.y) return last.half;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (!a || !b) break;
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return a.half + (b.half - a.half) * t;
    }
  }
  return last.half;
}

/**
 * 体幹の右半分の輪郭。体型の種別ごとに輪郭の通り方そのものを変える。
 * flat/soft は骨盤幅で終わり、round は骨盤より外へ丸く張り出し、
 * pendulous は袋状に垂れて下端が大腿にかかる。
 */
function torsoProfile(p: Physique): Profile {
  const shoulderY = SK.acromionY + 18 - p.neckSink * 0.5;
  // 胸は下垂するほど最大幅の位置が下がる
  const bustY = SK.nippleY + p.bustDrop * 20;
  const prof: Profile = [
    { y: SK.neckBaseY - 26 - p.neckSink, half: p.neckHalf * 0.95 },
    { y: SK.neckBaseY - 6 - p.neckSink * 0.7, half: SK.acromionX * 0.5 + p.trapBulk * 0.8 },
    // 僧帽筋の稜線。ここを丸めないと肩パッドを入れたように見える
    { y: SK.acromionY - 2 - p.neckSink * 0.5, half: SK.acromionX * 0.85 + p.trapBulk },
    { y: shoulderY, half: SK.acromionX + p.trapBulk },
    { y: SK.armpitY - 14, half: p.bustHalf * 0.93 },
    { y: bustY, half: p.bustHalf }, // 胸の最大幅
    { y: bustY + 36, half: p.underBustHalf }, // 胸の下でいったん絞れる
    { y: SK.ribY, half: p.ribHalf },
    { y: SK.waistY, half: p.waistHalf },
    { y: SK.crestY, half: p.crestHalf },
  ];

  switch (p.bellyKind) {
    case 'flat':
    case 'soft':
      prof.push({ y: SK.trochY, half: p.hipHalf });
      prof.push({ y: p.bellyBottomY - 8, half: p.hipHalf * 0.93 });
      prof.push({ y: p.bellyBottomY, half: p.hipHalf * 0.7 });
      break;
    case 'round':
      prof.push({ y: p.bellyMaxY, half: p.bellyHalf });
      prof.push({ y: p.bellyMaxY + 30, half: p.bellyHalf * 0.98 });
      prof.push({ y: p.bellyBottomY - 18, half: p.bellyHalf * 0.9 });
      prof.push({ y: p.bellyBottomY, half: p.bellyHalf * 0.62 });
      break;
    case 'pendulous':
      prof.push({ y: p.bellyMaxY, half: p.bellyHalf });
      prof.push({ y: p.bellyMaxY + 44, half: p.bellyHalf * 0.99 });
      prof.push({ y: p.bellyBottomY - 46, half: p.bellyHalf * 0.95 });
      prof.push({ y: p.bellyBottomY - 14, half: p.bellyHalf * 0.82 });
      prof.push({ y: p.bellyBottomY, half: p.bellyHalf * 0.55 });
      break;
  }

  // 同じ高さの点が並ぶと長さ0の区間ができ、輪郭の補間が不定になる。
  // 体型の数値をどう変えても単調増加になるよう、ここで最低間隔を確保する。
  for (let i = 1; i < prof.length; i++) {
    const prev = prof[i - 1];
    const cur = prof[i];
    if (!prev || !cur) continue;
    if (cur.y <= prev.y + 6) cur.y = prev.y + 6;
  }
  return prof;
}

function mirrorLoop(right: readonly Pt[], topY: number, bottomY: number): Pt[] {
  return [
    [0, topY],
    ...right,
    [0, bottomY],
    ...right.map(([x, y]) => [-x, y] as Pt).reverse(),
  ];
}

function torsoLoop(profile: Profile): Pt[] {
  const right: Pt[] = profile.map((s) => [s.half, s.y] as Pt);
  const topY = (profile[0]?.y ?? 0) - 6;
  const bottomY = (profile[profile.length - 1]?.y ?? 0) + 10;
  return mirrorLoop(right, topY, bottomY);
}

function headLoop(p: Physique): Pt[] {
  const c = p.cheek;
  const right: Pt[] = [
    [13, 1],
    [24, 8],
    [31, 24],
    [SK.craniumHalf, 44], // 頭蓋の幅は太っても変わらない
    [30.5, 60],
    [23 + c * 4, 78],
    [15 + c * 4 + p.jowl * 9, 91], // 下顎角（女性は幅が狭く角も丸い）
    [8 + p.jowl * 9, SK.chinY + p.jowl * 3],
  ];
  return mirrorLoop(right, 0, SK.chinY + 2 + p.jowl * 5);
}

/** 後ろで束ねた長髪。頭蓋より一回り大きく、耳の後ろまで覆う */
function hairLoop(): Pt[] {
  const right: Pt[] = [
    [15, -4],
    [28, 4],
    [35, 22],
    [36.5, 46],
    [33, 70], // 耳の後ろまで下りる
    [28, 84],
  ];
  return [
    [0, -5],
    ...right,
    [24, 46], // 生え際：中央で下がり、こめかみで上がる
    [18, 28],
    [9, 22],
    [0, 21],
    [-9, 22],
    [-18, 28],
    [-24, 46],
    ...right.map(([x, y]) => [-x, y] as Pt).reverse(),
  ];
}

/**
 * 束ねた毛先。頬の外側から肩へ落ちる。
 * 上端は髪の本体に隠れるので、顔にはかからない（本体を後から描く）。
 */
function hairTailLoop(): Pt[] {
  return [
    [30, 92], // 顎の外側、耳の下から始める（顔にはかからない）
    [42, 118],
    [50, 158],
    [52, 200],
    [48, 232], // 毛先
    [38, 236],
    [36, 196],
    [33, 154],
    [29, 120],
    [26, 96],
  ];
}

function neckLoop(p: Physique): Pt[] {
  const w = p.neckHalf;
  const top = SK.neckTopY - p.jowl * 6;
  const right: Pt[] = [
    [w * 0.82, top],
    [w * 0.95, top + 26],
    [w, SK.neckBaseY - 20],
    [w * 1.24 + p.trapBulk * 0.5, SK.neckBaseY + 2],
  ];
  return mirrorLoop(right, top - 6, SK.neckBaseY + 12);
}

function armChain(p: Physique, side: number, profile: Profile): { spine: Pt[]; radii: number[] } {
  const radii = [p.deltoidR, p.bicepsR, p.elbowR, p.foreArmR, p.wristR];
  const ys = [SK.shoulderJointY, 262, SK.elbowY, 356, SK.wristY];
  const baseX = [
    SK.shoulderJointX + p.armAbduct * 0.2,
    SK.shoulderJointX + 2 + p.armAbduct * 0.45,
    SK.shoulderJointX + 4 + p.armAbduct * 0.8,
    SK.shoulderJointX + 6 + p.armAbduct * 0.95,
    SK.shoulderJointX + 7 + p.armAbduct,
  ];
  // 腕の外縁が必ず体幹輪郭の外に出るまで押し出す。
  // 太った段階で「腹が腕を飲み込む」破綻が起きないようにするための保険。
  const spine: Pt[] = ys.map((y, i) => {
    const r = radii[i] ?? 0;
    const want = halfAt(profile, y) + 9 - r;
    return [side * Math.max(baseX[i] ?? 0, want), y] as Pt;
  });
  return { spine, radii };
}

/**
 * 手。手首から指先までは全高の約1/10で、段階が変わってもほとんど太らない。
 * 母指球側（体幹側）にふくらみを付けて、丸い塊にならないようにする。
 */
function handLoop(p: Physique, side: number, profile: Profile): Pt[] {
  const { spine, radii } = armChain(p, side, profile);
  const wrist = spine[spine.length - 1];
  const r = (radii[radii.length - 1] ?? 12) * 1.02;
  if (!wrist) return [];
  const wx = wrist[0];
  const wy = wrist[1];
  const out = side; // 体幹から見て外側
  // 手首より上から始めて前腕と重ねる。切り離すと手が浮いて見える
  return [
    [wx + out * r * 0.9, wy - 16],
    [wx + out * r * 1.16, wy + 14],
    [wx + out * r * 1.06, wy + 46],
    [wx + out * r * 0.62, wy + 68], // 指先
    [wx - out * r * 0.52, wy + 62],
    [wx - out * r * 1.02, wy + 28], // 母指球
    [wx - out * r * 0.92, wy - 14],
  ];
}

function legChain(p: Physique, side: number): { spine: Pt[]; radii: number[] } {
  const spine: Pt[] = [
    [side * SK.hipJointX, SK.hipJointY - 16],
    [side * (SK.hipJointX + 2), 450],
    [side * (SK.hipJointX + 4 - p.kneeIn), SK.kneeY],
    [side * (SK.hipJointX + 6 - p.kneeIn * 0.3 + p.stance * 0.45), SK.calfY],
    [side * (SK.hipJointX + 2 + p.stance), SK.ankleY],
  ];
  return { spine, radii: [p.thighR, p.thighMidR, p.kneeR, p.calfR, p.ankleR] };
}

function ankleX(p: Physique): number {
  return SK.hipJointX + 2 + p.stance;
}

function footLoop(p: Physique, side: number): Pt[] {
  const ax = ankleX(p);
  const r = p.ankleR;
  return [
    [side * (ax - r * 0.95), SK.ankleY - 6],
    [side * (ax - r * 1.25), SK.soleY - 16],
    [side * (ax - r * 1.15), SK.soleY],
    [side * (ax + r * 1.75), SK.soleY],
    [side * (ax + r * 1.85), SK.soleY - 18],
    [side * (ax + r * 1.15), SK.ankleY - 8],
  ];
}

function beltLine(p: Physique): number {
  // 腹が出るほどベルトは下がり、下垂した腹の下に隠れる
  switch (p.bellyKind) {
    case 'flat':
    case 'soft':
      return SK.crestY - 4;
    case 'round':
      return SK.crestY + 16;
    case 'pendulous':
      return SK.crestY + 26;
  }
}

/** ズボン。身体の和集合でクリップするので、外形は大きめの多角形でよい */
function trousersPath(p: Physique, profile: Profile): string {
  const beltY = beltLine(p);
  const half = halfAt(profile, beltY) * 1.06;
  const outer = ankleX(p) + p.ankleR * 2.4;
  return (
    `M ${-half} ${beltY - 6} ` +
    `Q 0 ${beltY + 8} ${half} ${beltY - 6} ` +
    `L ${outer} 700 L ${-outer} 700 Z`
  );
}

/** 袖。腕の中心線に沿わせるので、腕が外転しても袖だけ取り残されることがない */
function sleevePath(
  p: Physique,
  side: number,
  profile: Profile,
  long: boolean,
  up: (pts: readonly Pt[]) => Pt[],
): string {
  const { spine, radii } = armChain(p, side, profile);
  const pad = 4.5;
  // 長袖は手首の少し手前、半袖は上腕の中ほどで切る
  const count = long ? 4 : 3;
  const cut = spine.slice(0, count);
  const cutR = radii.slice(0, count).map((r) => r + pad);
  const a = spine[count - 1];
  const b = spine[count];
  const ra = radii[count - 1] ?? 0;
  const rb = radii[count] ?? 0;
  const t = long ? 0.82 : 0.55;
  if (a && b) {
    cut.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    cutR.push(ra + (rb - ra) * t + pad * 0.9);
  }
  return limbOutline(up(cut), cutR, { roundEnd: false, roundStart: true });
}

/**
 * 襟。首と胴の境目を作る。これが無いと首から下が地続きの塊に見える。
 * 襟が高い位置にあるほど首は短く見えるので、段階が進むほど上げる（首が肩に埋まる表現）。
 */
function collarPath(p: Physique, up: (pts: readonly Pt[]) => Pt[]): string {
  const y = SK.neckBaseY - 20 - p.neckSink;
  const w = p.neckHalf * 1.45 + p.trapBulk * 0.4;
  return closedSpline(
    up([
      [-w, y - 4],
      [-p.neckHalf * 0.85, y + 8],
      [0, y + 18],
      [p.neckHalf * 0.85, y + 8],
      [w, y - 4],
      [w * 1.05, y + 18],
      [0, y + 34],
      [-w * 1.05, y + 18],
    ]),
    0.6,
  );
}

function bootLoop(p: Physique, side: number): Pt[] {
  const ax = ankleX(p);
  const r = p.ankleR;
  return [
    [side * (ax - r * 1.35), 648],
    [side * (ax + r * 1.42), 648],
    [side * (ax + r * 1.6), SK.ankleY - 10],
    [side * (ax + r * 1.95), SK.soleY],
    [side * (ax - r * 1.3), SK.soleY],
    [side * (ax - r * 1.4), SK.ankleY - 10],
  ];
}

function shirtLoop(p: Physique, profile: Profile): Pt[] {
  const hem = p.shirtHemY;
  const top = SK.neckBaseY - 6 - p.neckSink;
  const right: Pt[] = [];
  for (let y = top; y <= hem; y += 20) right.push([halfAt(profile, y) * 1.01, y]);
  right.push([halfAt(profile, hem) * 1.01, hem]);
  return mirrorLoop(right, top - 4, hem + 6);
}

/** 上着の前身頃。段階が進むと前が閉じられなくなる */
function jacketLoops(p: Physique, profile: Profile): Pt[][] {
  const top = SK.neckBaseY - 10 - p.neckSink;
  const hem = Math.min(p.bellyBottomY - 8, 452);
  const panel = (side: number): Pt[] => {
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let y = top; y <= hem; y += 16) {
      const half = halfAt(profile, y) * 1.03;
      outer.push([side * half, y]);
      const gap = p.jacketGap * (y > SK.armpitY ? 1 : 0.4);
      inner.push([side * Math.min(gap, half * 0.92), y]);
    }
    const lastHalf = halfAt(profile, hem) * 1.03;
    outer.push([side * lastHalf, hem]);
    inner.push([side * Math.min(p.jacketGap, lastHalf * 0.92), hem]);
    return [...outer, ...inner.reverse()];
  };
  return [panel(1), panel(-1)];
}

interface RawShade {
  pts: Pt[];
  blur: number;
  opacity: number;
  open?: boolean;
  stroke?: number;
  lower?: boolean; // 下半身側（後傾させない）
}

function occlusionRaw(p: Physique, profile: Profile): RawShade[] {
  const out: RawShade[] = [];

  // --- 顔。目の高さは頭高のほぼ中央（頭頂から50）に置く ---
  // 生え際の落ち影
  out.push({
    pts: [
      [-28, 30],
      [0, 34],
      [28, 30],
      [0, 24],
    ],
    blur: 3.4,
    opacity: 0.3,
  });
  // 眉弓（眼窩上縁）。外側ほど落ちる
  for (const side of [1, -1]) {
    out.push({
      pts: [
        [side * 27, 47],
        [side * 16, 51],
        [side * 5, 50],
        [side * 16, 45],
      ],
      blur: 2,
      opacity: 0.4,
    });
  }
  // 眼窩の窪みと目
  for (const side of [1, -1]) {
    out.push({
      pts: [
        [side * 24, 52],
        [side * 15, 60],
        [side * 6, 56],
        [side * 15, 50],
      ],
      blur: 3,
      opacity: 0.3,
    });
    out.push({
      pts: [
        [side * 20, 55],
        [side * 15, 57.5],
        [side * 10, 55],
        [side * 15, 53],
      ],
      blur: 0.9,
      opacity: 0.62,
    });
  }
  // 耳
  for (const side of [1, -1]) {
    out.push({
      pts: [
        [side * 30, 53],
        [side * 34.5, 61],
        [side * 30, 72],
        [side * 27, 61],
      ],
      blur: 1.4,
      opacity: 0.34,
    });
  }
  // 鼻梁の陰（片側）と鼻翼・鼻孔
  out.push({
    pts: [
      [1, 52],
      [7, 72],
      [2, 76],
      [-2, 70],
    ],
    blur: 2,
    opacity: 0.34,
  });
  out.push({
    pts: [
      [-7, 74],
      [0, 71],
      [7, 74],
      [0, 78],
    ],
    blur: 1.4,
    opacity: 0.42,
  });
  // 口裂と下唇の影
  out.push({
    pts: [
      [-9, 85],
      [0, 86.5],
      [9, 85],
    ],
    blur: 1.1,
    opacity: 0.5,
    open: true,
    stroke: 2.4,
  });
  out.push({
    pts: [
      [-7, 90],
      [0, 92],
      [7, 90],
      [0, 88],
    ],
    blur: 2,
    opacity: 0.26,
  });
  // 頬（こけている段階だけ落ちる影）
  if (p.cheek < 1.05) {
    for (const side of [1, -1]) {
      out.push({
        pts: [
          [side * 26, 63],
          [side * 18, 78],
          [side * 22, 89],
        ],
        blur: 3.5,
        opacity: (1.05 - p.cheek) * 1.2,
        open: true,
        stroke: 8,
      });
    }
  }

  // 顎の下（二重顎の谷）
  out.push({
    pts: [
      [-(20 + p.jowl * 14), SK.chinY - 2],
      [0, SK.chinY + 10 + p.jowl * 9],
      [20 + p.jowl * 14, SK.chinY - 2],
      [0, SK.chinY - 8],
    ],
    blur: 5,
    opacity: 0.4 + p.jowl * 0.28,
  });

  // 鎖骨の窪み（痩せている段階ほどはっきり出る）
  if (p.bustDrop < 0.4) {
    out.push({
      pts: [
        [-p.neckHalf * 1.5, SK.neckBaseY + 6],
        [0, SK.neckBaseY + 16],
        [p.neckHalf * 1.5, SK.neckBaseY + 6],
        [0, SK.neckBaseY + 2],
      ],
      blur: 4,
      opacity: 0.3 - p.bustDrop * 0.4,
    });
  }

  // 乳房の下縁の陰。下垂するほど低く、深くなる
  for (const side of [1, -1]) {
    const cx = side * p.bustHalf * 0.46;
    const y = SK.nippleY + 26 + p.bustDrop * 34;
    const w = p.bustHalf * 0.42;
    out.push({
      pts: [
        [cx - w, y - 10],
        [cx, y + 6 + p.bustDrop * 14],
        [cx + w, y - 10],
        [cx, y - 8],
      ],
      blur: 5,
      opacity: 0.28 + p.bustDrop * 0.3,
    });
  }
  // 胸の谷
  out.push({
    pts: [
      [-7, SK.nippleY - 14],
      [0, SK.nippleY + 18 + p.bustDrop * 16],
      [7, SK.nippleY - 14],
      [0, SK.nippleY - 18],
    ],
    blur: 5,
    opacity: 0.16 + p.bustDrop * 0.18,
  });

  // 脇腹のロール（体側から内側へ流れる浅い段差）
  if (p.flankRoll > 0.1) {
    for (const side of [1, -1]) {
      const y = SK.waistY + 12;
      const half = halfAt(profile, y);
      out.push({
        pts: [
          [side * (half + 4), y - 14],
          [side * (half - 30 - p.flankRoll * 20), y + 2],
          [side * (half - 46 - p.flankRoll * 26), y + 26],
        ],
        blur: 7,
        opacity: 0.1 + p.flankRoll * 0.16,
        open: true,
        stroke: 9,
      });
    }
  }

  // 腹の下端。round は落ちる影、pendulous は大腿に落ちる濃い影
  if (p.bellyKind === 'round' || p.bellyKind === 'pendulous') {
    const y = p.bellyBottomY;
    const half = halfAt(profile, y - 14);
    const depth = p.bellyKind === 'pendulous' ? 42 : 22;
    out.push({
      pts: [
        [-half * 0.98, y - 14],
        [0, y + depth],
        [half * 0.98, y - 14],
        [0, y - 8],
      ],
      blur: 9,
      opacity: p.bellyKind === 'pendulous' ? 0.6 : 0.38,
    });
  }

  // 内腿（後傾させない）
  out.push({
    pts: [
      [-11, SK.crotchY + 6],
      [0, SK.kneeY - 30],
      [11, SK.crotchY + 6],
      [0, SK.crotchY - 4],
    ],
    blur: 8,
    opacity: 0.5,
    lower: true,
  });

  // 靴の接地
  for (const side of [1, -1]) {
    const ax = ankleX(p);
    out.push({
      pts: [
        [side * (ax - p.ankleR * 1.3), SK.soleY - 12],
        [side * (ax + p.ankleR * 1.9), SK.soleY - 12],
        [side * (ax + p.ankleR * 1.9), SK.soleY],
        [side * (ax - p.ankleR * 1.3), SK.soleY],
      ],
      blur: 5,
      opacity: 0.5,
      lower: true,
    });
  }

  return out;
}

function highlightLobes(p: Physique): Lobe[] {
  const lobes: Lobe[] = [];
  if (p.bellyKind !== 'flat') {
    const cy = (p.bellyMaxY + p.bellyBottomY) / 2 - (p.bellyKind === 'pendulous' ? 8 : 20);
    lobes.push({
      cx: -p.bellyHalf * 0.2,
      cy,
      rx: p.bellyHalf * 0.76,
      ry: Math.max((p.bellyBottomY - SK.waistY) * 0.46, 30),
      opacity: p.bellyKind === 'soft' ? 0.14 : 0.28,
    });
  }
  lobes.push({
    cx: -p.bustHalf * 0.46,
    cy: SK.nippleY - 4 + p.bustDrop * 16,
    rx: p.bustHalf * 0.44,
    ry: 30 + p.bustDrop * 14,
    opacity: 0.2 + p.bustDrop * 0.1,
  });
  lobes.push({
    cx: -(SK.acromionX * 0.8 + p.trapBulk),
    cy: SK.acromionY + 12,
    rx: p.deltoidR * 0.95,
    ry: p.deltoidR * 0.85,
    opacity: 0.2,
  });
  return lobes;
}

export function buildFigure(stage: Stage): FigureGeometry {
  const p = physiqueOf(stage);
  const profile = torsoProfile(p);
  const pivot: Pt = [0, SK.crotchY];
  const lean = p.lean;
  const up = (pts: readonly Pt[]): Pt[] => pts.map((q) => rotPt(q, -lean, pivot));

  const legs = [1, -1].map((side) => {
    const { spine, radii } = legChain(p, side);
    return limbOutline(spine, radii, { roundEnd: false });
  });
  const arms = [1, -1].map((side) => {
    const { spine, radii } = armChain(p, side, profile);
    return limbOutline(up(spine), radii, { roundEnd: true, roundStart: true });
  });
  const hands = [1, -1].map((side) => closedSpline(up(handLoop(p, side, profile)), 0.8));

  const hasJacket = p.outerwear !== 'shirt-only';
  const beltY = beltLine(p);
  const beltHalf = halfAt(profile, beltY);
  // 腹が下垂している段階ではベルトは腹の下に隠れて見えない
  const beltVisible = p.bellyKind !== 'pendulous';

  const widest = profile.reduce((m, s) => Math.max(m, s.half), 0);

  const occlusion: Shade[] = occlusionRaw(p, profile).map((s) => {
    const pts = s.lower ? s.pts : up(s.pts);
    const shade: Shade = {
      d: s.open ? openSpline(pts) : closedSpline(pts, 0.85),
      blur: s.blur,
      opacity: s.opacity,
    };
    if (s.stroke !== undefined) shade.stroke = s.stroke;
    return shade;
  });

  return {
    physique: p,
    parts: {
      legs,
      feet: [footLoop(p, 1), footLoop(p, -1)].map((l) => closedSpline(l, 0.6)),
      torso: closedSpline(up(torsoLoop(profile)), 0.85),
      neck: closedSpline(up(neckLoop(p)), 0.8),
      head: closedSpline(up(headLoop(p)), 0.9),
      hair: closedSpline(up(hairLoop()), 0.7),
      hairTail: closedSpline(up(hairTailLoop()), 0.85),
      arms,
      hands,
    },
    clothes: {
      trousers: trousersPath(p, profile),
      boots: [bootLoop(p, 1), bootLoop(p, -1)].map((l) => closedSpline(l, 0.25)),
      shirt: closedSpline(up(shirtLoop(p, profile)), 0.8),
      shirtSleeves: hasJacket ? [] : [1, -1].map((side) => sleevePath(p, side, profile, false, up)),
      jacket: hasJacket ? jacketLoops(p, profile).map((l) => closedSpline(up(l), 0.75)) : [],
      jacketSleeves: hasJacket
        ? [1, -1].map((side) => sleevePath(p, side, profile, true, up))
        : [],
      collar: collarPath(p, up),
      belt: beltVisible
        ? closedSpline(
            up([
              [-beltHalf, beltY - 5],
              [0, beltY + 5],
              [beltHalf, beltY - 5],
              [beltHalf, beltY + 9],
              [0, beltY + 19],
              [-beltHalf, beltY + 9],
            ]),
            0.5,
          )
        : '',
    },
    occlusion,
    highlights: highlightLobes(p).map((l) => {
      const [cx, cy] = rotPt([l.cx, l.cy], -lean, pivot);
      return { ...l, cx, cy };
    }),
    contact: {
      cx: 0,
      cy: SK.soleY + 2,
      rx: widest * 0.92 + p.stance,
      ry: 15 + p.stance * 0.3,
    },
  };
}

/** テスト用の内部公開。人体の破綻を機械的に検査するために使う */
export const __test = { torsoProfile, halfAt, armChain, legChain, handLoop };
