import { describe, expect, it } from 'vitest';
import { SK, __test, buildFigure } from './figure';
import { PHYSIQUES, physiqueOf } from './physique';
import type { Stage } from '../game/types';

const STAGES: Stage[] = [1, 2, 3, 4, 5, 6];

/**
 * 人体の破綻を目視ではなく機械的に止めるためのテスト。
 * 体型を触ったときに、関節がずれる・腕が胴に飲まれる・末端が丸太になる、といった
 * 典型的な壊れ方をここで落とす。
 */

describe('骨格は全段階で共通', () => {
  it('肘・手首・膝・足首・股下の高さが段階で動かない', () => {
    for (const stage of STAGES) {
      const arm = __test.armChain(physiqueOf(stage), 1, __test.torsoProfile(physiqueOf(stage)));
      const leg = __test.legChain(physiqueOf(stage), 1);
      expect(arm.spine[2]?.[1]).toBe(SK.elbowY);
      expect(arm.spine[4]?.[1]).toBe(SK.wristY);
      expect(leg.spine[2]?.[1]).toBe(SK.kneeY);
      expect(leg.spine[4]?.[1]).toBe(SK.ankleY);
    }
  });

  it('7.5頭身で、股下が全高の中央にある', () => {
    expect(SK.height / SK.chinY).toBe(7.5);
    expect(Math.abs(SK.crotchY - SK.height / 2)).toBeLessThanOrEqual(6);
  });

  it('膝は股下と踵の中間にある', () => {
    const mid = (SK.crotchY + SK.ankleY) / 2;
    expect(Math.abs(SK.kneeY - mid)).toBeLessThanOrEqual(10);
  });

  it('頭蓋の幅は太っても変わらない', () => {
    const widths = STAGES.map(
      (s) => Math.max(...__test.torsoProfile(physiqueOf(s)).map(() => SK.craniumHalf)),
    );
    expect(new Set(widths).size).toBe(1);
  });
});

describe('太り方の順序（仕様書 §3：単調増加）', () => {
  const keys = [
    'bustHalf',
    'underBustHalf',
    'waistHalf',
    'crestHalf',
    'bellyHalf',
    'hipHalf',
    'deltoidR',
    'bicepsR',
    'thighR',
    'calfR',
    'neckHalf',
    'jowl',
    'armAbduct',
    'stance',
    'lean',
  ] as const;

  it('どの部位も段階が進むと細くならない', () => {
    for (const key of keys) {
      for (let i = 1; i < PHYSIQUES.length; i++) {
        const prev = PHYSIQUES[i - 1];
        const cur = PHYSIQUES[i];
        if (!prev || !cur) continue;
        expect(cur[key]).toBeGreaterThanOrEqual(prev[key]);
      }
    }
  });

  it('腹は 平ら → 柔らかい → 丸い → 下垂 の順に質が変わる', () => {
    expect(PHYSIQUES.map((p) => p.bellyKind)).toEqual([
      'flat',
      'soft',
      'round',
      'round',
      'pendulous',
      'pendulous',
    ]);
  });

  it('ウエストが胸部幅を追い越すのは段階5から（男性より遅い）', () => {
    expect(physiqueOf(1).waistHalf).toBeLessThan(physiqueOf(1).bustHalf);
    expect(physiqueOf(4).waistHalf).toBeLessThanOrEqual(physiqueOf(4).bustHalf);
    expect(physiqueOf(5).waistHalf).toBeGreaterThan(physiqueOf(5).bustHalf);
    expect(physiqueOf(6).waistHalf).toBeGreaterThan(physiqueOf(6).bustHalf);
  });

  it('脂肪は殿部・大腿から先につく（段階1〜4は骨盤が身体の最大幅）', () => {
    for (const stage of [1, 2, 3, 4] as Stage[]) {
      const p = physiqueOf(stage);
      expect(p.hipHalf).toBeGreaterThan(p.bustHalf);
      expect(p.hipHalf).toBeGreaterThanOrEqual(p.bellyHalf);
    }
    // 下垂した段階では腹が骨盤を追い越す
    for (const stage of [5, 6] as Stage[]) {
      const p = physiqueOf(stage);
      expect(p.bellyHalf).toBeGreaterThan(p.hipHalf);
    }
  });

  it('肩より骨盤が広い（女性の骨格）', () => {
    for (const stage of [1, 2, 3] as Stage[]) {
      expect(physiqueOf(stage).hipHalf).toBeGreaterThan(SK.acromionX);
    }
  });

  it('胸は段階が進むほど下がる', () => {
    for (let i = 1; i < PHYSIQUES.length; i++) {
      const prev = PHYSIQUES[i - 1];
      const cur = PHYSIQUES[i];
      if (!prev || !cur) continue;
      expect(cur.bustDrop).toBeGreaterThanOrEqual(prev.bustDrop);
    }
  });

  it('末端（手首・足首・膝）は体幹よりずっと太りにくい', () => {
    const first = physiqueOf(1);
    const last = physiqueOf(6);
    const trunk = last.waistHalf / first.waistHalf;
    for (const key of ['wristR', 'ankleR', 'kneeR'] as const) {
      const ratio = last[key] / first[key];
      expect(ratio).toBeLessThan(trunk * 0.75);
      expect(ratio).toBeGreaterThan(1); // まったく変わらないのも不自然
    }
  });

  it('下垂した段階だけ腹の下端が股下より下に来る', () => {
    for (const p of PHYSIQUES) {
      if (p.bellyKind === 'pendulous') expect(p.bellyBottomY).toBeGreaterThan(SK.crotchY + 60);
      else expect(p.bellyBottomY).toBeLessThan(SK.crotchY + 75);
    }
  });
});

describe('輪郭が破綻しない', () => {
  it('腕の外縁が必ず体幹の外に出る（腹に飲み込まれない）', () => {
    for (const stage of STAGES) {
      const p = physiqueOf(stage);
      const profile = __test.torsoProfile(p);
      const { spine, radii } = __test.armChain(p, 1, profile);
      spine.forEach((pt, i) => {
        const r = radii[i] ?? 0;
        const outer = pt[0] + r;
        const torso = __test.halfAt(profile, pt[1]);
        expect(outer).toBeGreaterThan(torso + 6);
      });
    }
  });

  it('手が前腕と重なっていて、離れて浮かない', () => {
    for (const stage of STAGES) {
      const p = physiqueOf(stage);
      const profile = __test.torsoProfile(p);
      const wrist = __test.armChain(p, 1, profile).spine.at(-1);
      const hand = __test.handLoop(p, 1, profile);
      expect(wrist).toBeDefined();
      const topOfHand = Math.min(...hand.map(([, y]) => y));
      expect(topOfHand).toBeLessThan(wrist?.[1] ?? 0);
    }
  });

  it('体幹の輪郭が上から下へ破綻なく並んでいる', () => {
    for (const stage of STAGES) {
      const profile = __test.torsoProfile(physiqueOf(stage));
      for (let i = 1; i < profile.length; i++) {
        const prev = profile[i - 1];
        const cur = profile[i];
        if (!prev || !cur) continue;
        expect(cur.y).toBeGreaterThan(prev.y); // 高さが逆行しない
        expect(cur.half).toBeGreaterThan(0);
      }
    }
  });

  it('生成したパスに NaN や空文字が混ざらない', () => {
    for (const stage of STAGES) {
      const g = buildFigure(stage);
      const paths = [
        ...g.parts.legs,
        ...g.parts.feet,
        ...g.parts.arms,
        ...g.parts.hands,
        g.parts.torso,
        g.parts.neck,
        g.parts.head,
        g.parts.hair,
        g.parts.hairTail,
        g.clothes.trousers,
        ...g.clothes.boots,
        g.clothes.shirt,
        ...g.clothes.shirtSleeves,
        ...g.clothes.jacket,
        ...g.clothes.jacketSleeves,
        g.clothes.collar,
        ...g.occlusion.map((o) => o.d),
      ];
      for (const d of paths) {
        expect(d.length).toBeGreaterThan(0);
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('undefined');
      }
    }
  });

  it('段階が変わっても身長は変わらない（体型変化であって拡大縮小ではない）', () => {
    // head は M/C だけで出来ているので、数値は x,y の並びとして読める
    const ysOf = (d: string): number[] =>
      (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

    for (const stage of STAGES) {
      const g = buildFigure(stage);
      const top = Math.min(...ysOf(g.parts.head));
      // 頭頂は段階によらずほぼ同じ高さ（後傾のぶんだけ僅かに動く）
      expect(top).toBeGreaterThan(-8);
      expect(top).toBeLessThan(12);
      // 接地面も動かない
      expect(g.contact.cy).toBe(SK.soleY + 2);
    }
  });
});

describe('着衣は体型に追随する', () => {
  it('上着は 閉まる → 引き攣る → 閉まらない → 着られない の順に変わる', () => {
    expect(PHYSIQUES.map((p) => p.outerwear)).toEqual([
      'jacket',
      'jacket',
      'jacket-strained',
      'jacket-open',
      'shirt-only',
      'shirt-only',
    ]);
  });

  it('上着を着ている段階だけ袖がある', () => {
    for (const stage of STAGES) {
      const g = buildFigure(stage);
      const hasJacket = physiqueOf(stage).outerwear !== 'shirt-only';
      expect(g.clothes.jacketSleeves.length).toBe(hasJacket ? 2 : 0);
      expect(g.clothes.shirtSleeves.length).toBe(hasJacket ? 0 : 2);
    }
  });

  it('下垂した腹の段階ではベルトが隠れる', () => {
    for (const stage of STAGES) {
      const g = buildFigure(stage);
      const pendulous = physiqueOf(stage).bellyKind === 'pendulous';
      expect(g.clothes.belt === '').toBe(pendulous);
    }
  });

  it('高段階ではシャツの裾が腹の下端より上がる（腹が出る）', () => {
    expect(physiqueOf(5).shirtHemY).toBeLessThan(physiqueOf(5).bellyBottomY);
    expect(physiqueOf(6).shirtHemY).toBeLessThan(physiqueOf(6).bellyBottomY);
  });
});
