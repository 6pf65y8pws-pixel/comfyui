import type { Ability, Stage, StageDef } from './types';

/**
 * 段階テーブル（仕様書 §3）。段階は単調増加のみ。減少は一切ない。
 *
 * 段階3で duct を、段階4で climb を失う。この2つは特定の出口の必須条件であり、
 * 「食べない選択」に意味を与えている唯一の仕組み。緩めないこと。
 */
export const STAGES: readonly StageDef[] = [
  { stage: 1, weightKg: 62, abilities: ['duct', 'climb', 'run'] },
  { stage: 2, weightKg: 78, abilities: ['duct', 'climb', 'run', 'push'] },
  // 段階3: plate 解禁 / duct 封印
  { stage: 3, weightKg: 95, abilities: ['climb', 'run', 'push', 'plate'] },
  // 段階4: breakFloor 解禁 / climb 封印
  { stage: 4, weightKg: 118, abilities: ['run', 'push', 'plate', 'breakFloor'] },
  // 段階5: heavyDoor 解禁 / run 封印
  { stage: 5, weightKg: 150, abilities: ['push', 'plate', 'breakFloor', 'heavyDoor'] },
  // 段階6: 自力移動不可 → 強制エンディング
  { stage: 6, weightKg: 190, abilities: [] },
] as const;

export const MAX_STAGE: Stage = 6;

export function stageDef(stage: Stage): StageDef {
  const def = STAGES[stage - 1];
  if (!def) throw new Error(`未定義の段階: ${stage}`);
  return def;
}

export function weightOf(stage: Stage): number {
  return stageDef(stage).weightKg;
}

export function abilitiesOf(stage: Stage): readonly Ability[] {
  return stageDef(stage).abilities;
}

export function hasAbility(stage: Stage, ability: Ability): boolean {
  return abilitiesOf(stage).includes(ability);
}

/** from → to で失われた能力 */
export function lostAbilities(from: Stage, to: Stage): Ability[] {
  const next = abilitiesOf(to);
  return abilitiesOf(from).filter((a) => !next.includes(a));
}

/** from → to で解禁された能力 */
export function gainedAbilities(from: Stage, to: Stage): Ability[] {
  const prev = abilitiesOf(from);
  return abilitiesOf(to).filter((a) => !prev.includes(a));
}

/** 能力を失った時の通知。静かに、演出過剰にしない（仕様書 §7） */
export const ABILITY_LOST_NOTICE: Partial<Record<Ability, string>> = {
  duct: '── 通風ダクトの幅を思い出す。あそこは、もう通らない。',
  climb: '── 梯子や細い足場に、もう体は預けられない。',
  run: '── 走ることは、もうできない。',
};

/** 能力を得た時の通知 */
export const ABILITY_GAINED_NOTICE: Partial<Record<Ability, string>> = {
  push: '── 重いものに、体重を預けられそうだ。',
  plate: '── 圧力プレートを踏み込めそうだ。',
  breakFloor: '── 老朽化した床なら、踏み抜けそうだ。',
  heavyDoor: '── 防爆扉でも、押し開けられそうだ。',
};
