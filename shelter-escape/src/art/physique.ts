import type { Stage } from '../game/types';

/**
 * 体型定義。
 *
 * 数値は実測値から起こしている。単位は「頭高＝100」（身長175cm・全高750 に相当、1cm ≒ 4.3）。
 * 幅は正面から見た半幅：
 *   体幹は楕円断面なので 幅 ≒ 周囲長 × 0.31、四肢はほぼ円断面なので 直径 ＝ 周囲長 ÷ π。
 *
 * 重要：これは「腹のスケール値」ではない。段階ごとに脂肪の付く場所・姿勢・服の合い方を
 * 別々に決めている。人間の増量は等倍拡大ではないので、
 *   - 手首・足首・膝・頭蓋は最後までほとんど変わらない（末端と骨は太らない）
 *   - 首は太るというより「肩に埋まる」
 *   - 腹は 平ら → 柔らかい → 前に丸く出る → 下垂する と質そのものが変わる
 *   - 段階4以降はウエスト幅が胸郭幅を追い越す
 *   - 重心が前に出るので体幹は後傾し、支持基底面を広げるため足幅が開く
 *   - 上腕が体幹に当たるので肩の外転角が増える（腕が体側に下ろせなくなる）
 *   - 服は途中で合わなくなる（閉まる → 引き攣る → 閉まらない → 着られない）
 * を段階ごとに作り分けている。
 *
 * 骨格（関節位置）は figure.ts の SKELETON 側に固定してあり、ここでは動かさない。
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
  jowl: number; // 顎下の脂肪（二重顎）
  neckHalf: number; // 首の半幅
  neckSink: number; // 首が肩に埋まる量。肩線が上がって首が短く見える
  trapBulk: number; // 僧帽筋上の脂肪パッド

  // --- 体幹 ---
  chestHalf: number; // 腋窩位置の半幅
  chestSag: number; // 胸部脂肪の下垂 0..1
  ribHalf: number; // 第10肋骨位置
  waistHalf: number; // ウエスト
  crestHalf: number; // 腸骨稜
  flankRoll: number; // 脇腹のロール（段差）
  bellyKind: BellyKind;
  bellyHalf: number; // 腹部最大半幅
  bellyMaxY: number; // 最大幅の高さ
  bellyBottomY: number; // 腹部下端（股下 378 を超えると下垂）
  hipHalf: number; // 大転子

  // --- 上肢 ---
  deltoidR: number;
  bicepsR: number;
  elbowR: number;
  foreArmR: number;
  wristR: number;
  armAbduct: number; // 体側から腕が離れる量

  // --- 下肢 ---
  thighR: number;
  thighMidR: number;
  kneeR: number;
  calfR: number;
  ankleR: number;
  stance: number; // 足首の開き
  kneeIn: number; // 外反膝（膝が内へ寄る）

  // --- 姿勢・着衣 ---
  lean: number; // 体幹の後傾（度）
  outerwear: Outerwear;
  jacketGap: number; // 前身頃の開き（半幅）
  shirtHemY: number; // シャツの裾。腹部下端より上なら腹が露出する
}

const P: Record<Stage, Physique> = {
  1: {
    stage: 1,
    weightKg: 62,
    bmi: 20.2,
    note: '痩せ型。胸囲88 / 腹囲76。鎖骨と頬骨が出る。腹は平らで、手足は細い。',
    cheek: 0.88,
    jowl: 0,
    neckHalf: 25,
    neckSink: 0,
    trapBulk: 0,
    chestHalf: 63,
    chestSag: 0,
    ribHalf: 57,
    waistHalf: 54,
    crestHalf: 62,
    flankRoll: 0,
    bellyKind: 'flat',
    bellyHalf: 60,
    bellyMaxY: 356,
    bellyBottomY: 400,
    hipHalf: 71,
    deltoidR: 24,
    bicepsR: 19,
    elbowR: 18,
    foreArmR: 17,
    wristR: 11.5,
    armAbduct: 0,
    thighR: 36,
    thighMidR: 31,
    kneeR: 22,
    calfR: 24,
    ankleR: 15,
    stance: 0,
    kneeIn: 0,
    lean: 0,
    outerwear: 'jacket',
    jacketGap: 0,
    shirtHemY: 420,
  },
  2: {
    stage: 2,
    weightKg: 78,
    bmi: 25.5,
    note: '標準〜がっしり。胸囲100 / 腹囲90。輪郭が滑らかになり、腹はまだほぼ平ら。',
    cheek: 1,
    jowl: 0.12,
    neckHalf: 27,
    neckSink: 1,
    trapBulk: 2,
    chestHalf: 72,
    chestSag: 0.06,
    ribHalf: 67,
    waistHalf: 65,
    crestHalf: 70,
    flankRoll: 0.06,
    bellyKind: 'soft',
    bellyHalf: 70,
    bellyMaxY: 360,
    bellyBottomY: 406,
    hipHalf: 78,
    deltoidR: 27,
    bicepsR: 21.5,
    elbowR: 19.5,
    foreArmR: 18.5,
    wristR: 12,
    armAbduct: 3,
    thighR: 39,
    thighMidR: 34,
    kneeR: 23.5,
    calfR: 26,
    ankleR: 15.5,
    stance: 3,
    kneeIn: 0,
    lean: 0.4,
    outerwear: 'jacket',
    jacketGap: 0,
    shirtHemY: 424,
  },
  3: {
    stage: 3,
    weightKg: 95,
    bmi: 31,
    note: 'はっきり太め。胸囲112 / 腹囲108。腹が前に丸く出て顎の下に肉。上着は閉まるが引き攣る。',
    cheek: 1.15,
    jowl: 0.4,
    neckHalf: 30,
    neckSink: 3,
    trapBulk: 4,
    chestHalf: 80,
    chestSag: 0.22,
    ribHalf: 77,
    waistHalf: 78,
    crestHalf: 82,
    flankRoll: 0.28,
    bellyKind: 'round',
    bellyHalf: 87,
    bellyMaxY: 368,
    bellyBottomY: 424,
    hipHalf: 85,
    deltoidR: 30.5,
    bicepsR: 24.5,
    elbowR: 21.5,
    foreArmR: 20.5,
    wristR: 13,
    armAbduct: 8,
    thighR: 41,
    thighMidR: 37,
    kneeR: 25,
    calfR: 29,
    ankleR: 16.5,
    stance: 7,
    kneeIn: 1,
    lean: 1.2,
    outerwear: 'jacket-strained',
    jacketGap: 0,
    shirtHemY: 432,
  },
  4: {
    stage: 4,
    weightKg: 118,
    bmi: 38.5,
    note: '肥満。腹囲130がウエスト幅で胸郭を追い越す。首が肩に埋まり、上着の前は閉まらない。',
    cheek: 1.3,
    jowl: 0.7,
    neckHalf: 34,
    neckSink: 7,
    trapBulk: 8,
    chestHalf: 91,
    chestSag: 0.45,
    ribHalf: 91,
    waistHalf: 93,
    crestHalf: 95,
    flankRoll: 0.55,
    bellyKind: 'round',
    bellyHalf: 103,
    bellyMaxY: 376,
    bellyBottomY: 448,
    hipHalf: 96,
    deltoidR: 35,
    bicepsR: 29,
    elbowR: 24.5,
    foreArmR: 23.5,
    wristR: 14,
    armAbduct: 16,
    thighR: 48,
    thighMidR: 43,
    kneeR: 28,
    calfR: 33,
    ankleR: 18,
    stance: 12,
    kneeIn: 3,
    lean: 2.2,
    outerwear: 'jacket-open',
    jacketGap: 30,
    shirtHemY: 442,
  },
  5: {
    stage: 5,
    weightKg: 150,
    bmi: 49,
    note: '高度肥満。腹部が下垂して大腿にかかる。胸部にも脂肪。上着は着られず、シャツの裾が上がる。',
    cheek: 1.45,
    jowl: 1,
    neckHalf: 36,
    neckSink: 13,
    trapBulk: 13,
    chestHalf: 104,
    chestSag: 0.72,
    ribHalf: 108,
    waistHalf: 113,
    crestHalf: 112,
    flankRoll: 0.8,
    bellyKind: 'pendulous',
    bellyHalf: 122,
    bellyMaxY: 396,
    bellyBottomY: 486,
    hipHalf: 106,
    deltoidR: 41,
    bicepsR: 34.5,
    elbowR: 28,
    foreArmR: 27,
    wristR: 15,
    armAbduct: 28,
    thighR: 57,
    thighMidR: 51,
    kneeR: 32,
    calfR: 37,
    ankleR: 19.5,
    stance: 18,
    kneeIn: 6,
    lean: 3.4,
    outerwear: 'shirt-only',
    jacketGap: 0,
    shirtHemY: 452,
  },
  6: {
    stage: 6,
    weightKg: 190,
    bmi: 62,
    note: '超高度肥満。頸部は脂肪に埋もれ、腹部は大腿中央まで下垂。自力での移動が難しい。',
    cheek: 1.6,
    jowl: 1.35,
    neckHalf: 40,
    neckSink: 20,
    trapBulk: 19,
    chestHalf: 117,
    chestSag: 1,
    ribHalf: 124,
    waistHalf: 130,
    crestHalf: 128,
    flankRoll: 1,
    bellyKind: 'pendulous',
    bellyHalf: 141,
    bellyMaxY: 408,
    bellyBottomY: 534,
    hipHalf: 118,
    deltoidR: 47,
    bicepsR: 40,
    elbowR: 31.5,
    foreArmR: 30,
    wristR: 16,
    armAbduct: 42,
    thighR: 65,
    thighMidR: 58,
    kneeR: 36,
    calfR: 41,
    ankleR: 21,
    stance: 24,
    kneeIn: 10,
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
