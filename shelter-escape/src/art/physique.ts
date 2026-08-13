import type { Stage } from '../game/types';

/**
 * 体型定義（女性・身長165cm）。
 *
 * 数値は実測値から起こしている。単位は「頭高＝100」（全高750 が身長165cm、1cm ≒ 4.55）。
 * 幅は正面から見た半幅：
 *   体幹は楕円断面なので 幅 ≒ 周囲長 × 0.31、四肢はほぼ円断面なので 直径 ＝ 周囲長 ÷ π。
 *
 * 重要：男性体型の数値を細くしたものではない。女性の骨格と脂肪分布に合わせて作り直している。
 *   - 肩は狭く（肩峰幅36cm）、骨盤は広い。段階1〜3では骨盤が身体の最大幅になる
 *   - 脂肪は殿部・大腿・胸部から先につく（gynoid型）。腹が主役になるのは段階4以降
 *   - ウエストが胸部幅を追い越すのは段階5から（男性より遅い）
 *   - 骨盤が広いぶん大腿骨の角度（Q角）が大きく、膝が内へ寄り足先が外を向く
 *   - 手首・足首・膝・頭蓋は最後までほとんど変わらない（末端と骨は太らない）
 *   - 腹は 平ら → 柔らかい → 下腹が丸い → 下垂 と質そのものが変わる
 *   - 重心が前に出るので体幹は後傾し、支持基底面を広げるため足幅が開く
 *   - 服は途中で合わなくなる（閉まる → 引き攣る → 閉まらない → 着られない）
 *
 * 骨格（関節位置）は figure.ts の SK に固定してあり、ここでは動かさない。
 */

export type BellyKind = 'flat' | 'soft' | 'round' | 'pendulous';
export type Outerwear = 'jacket' | 'jacket-strained' | 'jacket-open' | 'shirt-only';

export interface Physique {
  stage: Stage;
  weightKg: number;
  bmi: number;
  note: string;

  // --- 頭頸部 ---
  cheek: number; // 頬の肉。1未満はこけている（頭蓋の幅は不変）
  jowl: number; // 顎下の脂肪
  neckHalf: number; // 首の半幅
  neckSink: number; // 首が肩に埋まる量
  trapBulk: number; // 僧帽筋上の脂肪パッド

  // --- 体幹 ---
  bustHalf: number; // 胸部の最大半幅
  bustDrop: number; // 胸部の下垂 0..1
  underBustHalf: number; // 胸の下（肋骨下縁）
  ribHalf: number; // 第10肋骨位置
  waistHalf: number; // ウエスト最狭部
  crestHalf: number; // 腸骨稜
  flankRoll: number; // 脇腹のロール
  bellyKind: BellyKind;
  bellyHalf: number; // 腹部最大半幅
  bellyMaxY: number;
  bellyBottomY: number; // 股下 378 を超えると下垂
  hipHalf: number; // 大転子（女性では長らくここが最大幅）

  // --- 上肢 ---
  deltoidR: number;
  bicepsR: number;
  elbowR: number;
  foreArmR: number;
  wristR: number;
  armAbduct: number;

  // --- 下肢 ---
  thighR: number;
  thighMidR: number;
  kneeR: number;
  calfR: number;
  ankleR: number;
  stance: number;
  kneeIn: number; // Q角による膝の内寄り

  // --- 姿勢・着衣 ---
  lean: number; // 体幹の後傾（度）
  outerwear: Outerwear;
  jacketGap: number;
  shirtHemY: number;
}

const P: Record<Stage, Physique> = {
  1: {
    stage: 1,
    weightKg: 62,
    bmi: 22.8,
    note: '標準。バスト88 / ウエスト70 / ヒップ96。肩より骨盤がわずかに広い。手足は細い。',
    cheek: 0.95,
    jowl: 0,
    neckHalf: 23,
    neckSink: 0,
    trapBulk: 0,
    bustHalf: 64,
    bustDrop: 0.12,
    underBustHalf: 53,
    ribHalf: 54,
    waistHalf: 55,
    crestHalf: 66,
    flankRoll: 0,
    bellyKind: 'flat',
    bellyHalf: 64,
    bellyMaxY: 352,
    bellyBottomY: 400,
    hipHalf: 77,
    deltoidR: 22,
    bicepsR: 19,
    elbowR: 16.5,
    foreArmR: 16.5,
    wristR: 11,
    armAbduct: 0,
    thighR: 39,
    thighMidR: 34,
    kneeR: 25,
    calfR: 24.5,
    ankleR: 15,
    stance: 2,
    kneeIn: 3,
    lean: 0,
    outerwear: 'jacket',
    jacketGap: 0,
    shirtHemY: 420,
  },
  2: {
    stage: 2,
    weightKg: 78,
    bmi: 28.7,
    note: 'ふくよか。バスト98 / ウエスト82 / ヒップ110。殿部と大腿から先に増える。腹はまだ平ら。',
    cheek: 1.08,
    jowl: 0.12,
    neckHalf: 25,
    neckSink: 1,
    trapBulk: 2,
    bustHalf: 72,
    bustDrop: 0.22,
    underBustHalf: 62,
    ribHalf: 63,
    waistHalf: 64,
    crestHalf: 76,
    flankRoll: 0.08,
    bellyKind: 'soft',
    bellyHalf: 74,
    bellyMaxY: 358,
    bellyBottomY: 406,
    hipHalf: 88,
    deltoidR: 25,
    bicepsR: 22,
    elbowR: 18,
    foreArmR: 18,
    wristR: 11.5,
    armAbduct: 3,
    thighR: 45,
    thighMidR: 39,
    kneeR: 26.5,
    calfR: 27,
    ankleR: 15.5,
    stance: 4,
    kneeIn: 4,
    lean: 0.4,
    outerwear: 'jacket',
    jacketGap: 0,
    shirtHemY: 424,
  },
  3: {
    stage: 3,
    weightKg: 95,
    bmi: 34.9,
    note: '肥満。バスト108 / ウエスト96 / ヒップ124。大腿が接し、下腹が丸みを持つ。上着は閉まるが引き攣る。',
    cheek: 1.2,
    jowl: 0.35,
    neckHalf: 27.5,
    neckSink: 3,
    trapBulk: 4,
    bustHalf: 80,
    bustDrop: 0.38,
    underBustHalf: 71,
    ribHalf: 72,
    waistHalf: 74,
    crestHalf: 88,
    flankRoll: 0.3,
    bellyKind: 'round',
    bellyHalf: 92,
    bellyMaxY: 368,
    bellyBottomY: 424,
    hipHalf: 99,
    deltoidR: 29,
    bicepsR: 25.5,
    elbowR: 20,
    foreArmR: 20,
    wristR: 12.5,
    armAbduct: 8,
    thighR: 52,
    thighMidR: 46,
    kneeR: 28.5,
    calfR: 30,
    ankleR: 16.5,
    stance: 8,
    kneeIn: 6,
    lean: 1.2,
    outerwear: 'jacket-strained',
    jacketGap: 0,
    shirtHemY: 432,
  },
  4: {
    stage: 4,
    weightKg: 118,
    bmi: 43.3,
    note: '高度肥満。ウエスト116がバスト幅に並ぶ。腹部が前に張り出し、首が肩に埋まる。上着の前は閉まらない。',
    cheek: 1.32,
    jowl: 0.62,
    neckHalf: 31,
    neckSink: 7,
    trapBulk: 8,
    bustHalf: 89,
    bustDrop: 0.6,
    underBustHalf: 84,
    ribHalf: 85,
    waistHalf: 89,
    crestHalf: 101,
    flankRoll: 0.55,
    bellyKind: 'round',
    bellyHalf: 106,
    bellyMaxY: 376,
    bellyBottomY: 448,
    hipHalf: 111,
    deltoidR: 34,
    bicepsR: 30.5,
    elbowR: 23,
    foreArmR: 23,
    wristR: 13.5,
    armAbduct: 15,
    thighR: 61,
    thighMidR: 54,
    kneeR: 31.5,
    calfR: 34,
    ankleR: 17.5,
    stance: 12,
    kneeIn: 9,
    lean: 2.2,
    outerwear: 'jacket-open',
    jacketGap: 28,
    shirtHemY: 442,
  },
  5: {
    stage: 5,
    weightKg: 150,
    bmi: 55,
    note: '超高度肥満。腹部が下垂して大腿にかかる。胸部も垂れ、大腿が擦れる。上着は着られない。',
    cheek: 1.45,
    jowl: 0.9,
    neckHalf: 35,
    neckSink: 13,
    trapBulk: 13,
    bustHalf: 100,
    bustDrop: 0.85,
    underBustHalf: 99,
    ribHalf: 100,
    waistHalf: 106,
    crestHalf: 116,
    flankRoll: 0.8,
    bellyKind: 'pendulous',
    bellyHalf: 128,
    bellyMaxY: 396,
    bellyBottomY: 486,
    hipHalf: 124,
    deltoidR: 40,
    bicepsR: 36,
    elbowR: 26.5,
    foreArmR: 26.5,
    wristR: 14.5,
    armAbduct: 26,
    thighR: 71,
    thighMidR: 63,
    kneeR: 35,
    calfR: 38,
    ankleR: 19,
    stance: 18,
    kneeIn: 12,
    lean: 3.4,
    outerwear: 'shirt-only',
    jacketGap: 0,
    shirtHemY: 452,
  },
  6: {
    stage: 6,
    weightKg: 190,
    bmi: 69.8,
    note: '病的肥満。頸部は脂肪に埋もれ、腹部は大腿中央まで下垂。自力での移動が難しい。',
    cheek: 1.58,
    jowl: 1.25,
    neckHalf: 39,
    neckSink: 20,
    trapBulk: 19,
    bustHalf: 110,
    bustDrop: 1,
    underBustHalf: 112,
    ribHalf: 114,
    waistHalf: 122,
    crestHalf: 130,
    flankRoll: 1,
    bellyKind: 'pendulous',
    bellyHalf: 148,
    bellyMaxY: 408,
    bellyBottomY: 534,
    hipHalf: 138,
    deltoidR: 46,
    bicepsR: 42,
    elbowR: 30,
    foreArmR: 30,
    wristR: 15.5,
    armAbduct: 40,
    thighR: 81,
    thighMidR: 72,
    kneeR: 39,
    calfR: 43,
    ankleR: 20.5,
    stance: 24,
    kneeIn: 15,
    lean: 4.5,
    outerwear: 'shirt-only',
    jacketGap: 0,
    shirtHemY: 466,
  },
};

export function physiqueOf(stage: Stage): Physique {
  return P[stage];
}

export const PHYSIQUES: readonly Physique[] = [P[1], P[2], P[3], P[4], P[5], P[6]];
