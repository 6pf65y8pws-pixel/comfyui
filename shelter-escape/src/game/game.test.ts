import { describe, expect, it } from 'vitest';
import { ALL_ROOM_IDS, exploreAll, findDeadEnds, reachableRoomIds } from './reachability';
import { createInitialState, gameReducer } from './reducer';
import { ENDINGS, FOODS, ROOMS } from './rooms';
import { MAX_STAGE, STAGES, abilitiesOf, hasAbility } from './stages';
import type { GameState, Stage } from './types';

/** テスト用：ホットスポットを押す */
function use(state: GameState, hotspotId: string): GameState {
  return gameReducer(state, { type: 'USE_HOTSPOT', hotspotId });
}

/** テスト用：確認ダイアログを通して食べる */
function eat(state: GameState, foodId: string): GameState {
  const asked = gameReducer(state, { type: 'REQUEST_EAT', foodId });
  return gameReducer(asked, { type: 'CONFIRM_EAT' });
}

describe('段階システム（仕様書 §3）', () => {
  it('体重は単調増加する', () => {
    for (let i = 1; i < STAGES.length; i++) {
      const prev = STAGES[i - 1];
      const cur = STAGES[i];
      expect(prev && cur && cur.weightKg > prev.weightKg).toBe(true);
    }
  });

  it('段階3で duct を失い、段階4で climb を失う', () => {
    expect(hasAbility(2, 'duct')).toBe(true);
    expect(hasAbility(3, 'duct')).toBe(false);
    expect(hasAbility(3, 'climb')).toBe(true);
    expect(hasAbility(4, 'climb')).toBe(false);
    expect(hasAbility(4, 'run')).toBe(true);
    expect(hasAbility(5, 'run')).toBe(false);
  });

  it('一度失った能力が後の段階で戻らない', () => {
    for (let s = 1; s <= MAX_STAGE - 1; s++) {
      const now = abilitiesOf(s as Stage);
      for (let later = s + 1; later <= MAX_STAGE; later++) {
        const lost = now.filter((a) => !abilitiesOf(later as Stage).includes(a));
        for (const a of lost) {
          expect(hasAbility(later as Stage, a)).toBe(false);
        }
      }
    }
  });

  it('段階6では自力移動の能力が残らない', () => {
    expect(abilitiesOf(6)).toHaveLength(0);
  });
});

describe('コアループ（仕様書 §10-3）', () => {
  it('棚を押せない → 食べる → 押せる → でもダクトに戻れない', () => {
    let s = createInitialState();
    expect(s.stage).toBe(1);

    // 62kg では棚が動かない
    s = use(s, 'mess_to_storage');
    s = use(s, 'storage_shelf');
    expect(s.solvedHotspotIds).not.toContain('storage_shelf');
    expect(s.log.at(-1)).toContain('足りないのは力ではなく');

    // 食べると 78kg になり、押せるようになる
    s = use(s, 'storage_to_mess');
    s = eat(s, 'food_cans');
    expect(s.stage).toBe(2);
    s = use(s, 'mess_to_storage');
    s = use(s, 'storage_shelf');
    expect(s.solvedHotspotIds).toContain('storage_shelf');

    // この時点ではまだダクトを通れる（段階2）
    expect(hasAbility(s.stage, 'duct')).toBe(true);

    // もう一度食べると 95kg。ダクトは永久に閉じる
    s = eat(s, 'food_ration');
    expect(s.stage).toBe(3);
    expect(hasAbility(s.stage, 'duct')).toBe(false);
    s = use(s, 'storage_to_mess');
    s = use(s, 'mess_duct');
    expect(s.endingId).toBeNull();
    expect(s.log.at(-1)).toContain('もう幅が足りない');
  });

  it('段階3なら圧力プレートを踏めて、非常階段で脱出できる', () => {
    let s = createInitialState();
    s = eat(s, 'food_cans');
    s = use(s, 'mess_to_storage');
    s = eat(s, 'food_ration');
    s = use(s, 'storage_shelf');
    s = use(s, 'storage_passage');
    expect(s.currentRoomId).toBe('power_room');

    s = use(s, 'power_plate');
    expect(s.solvedHotspotIds).toContain('power_plate');
    s = use(s, 'power_stairs');
    expect(s.endingId).toBe('ending_stairs');
  });

  it('何も食べなければ最短でダクトから脱出できる', () => {
    const s = use(createInitialState(), 'mess_duct');
    expect(s.endingId).toBe('ending_duct');
  });
});

describe('不可逆性（仕様書 §3）', () => {
  it('体重が減る操作は存在しない', () => {
    for (const node of exploreAll().values()) {
      for (const nextKey of node.nextKeys) {
        const nextStage = Number(nextKey.split('|')[0]);
        expect(nextStage).toBeGreaterThanOrEqual(node.state.stage);
      }
    }
  });

  it('食べるのは確認を経た時だけで、キャンセルしたら何も起きない', () => {
    const s = createInitialState();
    const asked = gameReducer(s, { type: 'REQUEST_EAT', foodId: 'food_cans' });
    expect(asked.pendingFoodId).toBe('food_cans');
    expect(asked.stage).toBe(1);

    const cancelled = gameReducer(asked, { type: 'CANCEL_EAT' });
    expect(cancelled.pendingFoodId).toBeNull();
    expect(cancelled.stage).toBe(1);
    expect(cancelled.consumedFoodIds).toHaveLength(0);
  });

  it('同じ食料は二度食べられない', () => {
    const once = eat(createInitialState(), 'food_cans');
    const twice = eat(once, 'food_cans');
    expect(twice.stage).toBe(2);
    expect(twice.consumedFoodIds).toEqual(['food_cans']);
  });

  it('1回の食事で上がる段階は1つだけ', () => {
    for (const food of FOODS) {
      expect(food.stageGain).toBe(1);
    }
  });
});

describe('詰み防止の保証（仕様書 §6）', () => {
  it('到達できるどの状態からも、少なくとも1つのエンディングに行ける', () => {
    const dead = findDeadEnds();
    const detail = dead.map((d) => d.key).join('\n');
    expect(detail).toBe('');
    expect(dead).toHaveLength(0);
  });

  it('定義した部屋はすべて到達できる', () => {
    const reachable = reachableRoomIds();
    for (const id of ALL_ROOM_IDS) {
      expect(reachable.has(id)).toBe(true);
    }
  });

  it('全エンディングが実際に到達可能', () => {
    const reached = new Set<string>();
    for (const node of exploreAll().values()) {
      const room = ROOMS.find((r) => r.id === node.state.currentRoomId);
      for (const h of room?.hotspots ?? []) {
        if (h.endingId === undefined) continue;
        const after = use(node.state, h.id);
        if (after.endingId !== null) reached.add(after.endingId);
      }
    }
    for (const ending of ENDINGS) {
      expect(reached.has(ending.id)).toBe(true);
    }
  });
});

describe('データの整合性', () => {
  it('ホットスポットの参照先がすべて存在する', () => {
    const roomIds = new Set(ROOMS.map((r) => r.id));
    const endingIds = new Set(ENDINGS.map((e) => e.id));
    for (const room of ROOMS) {
      for (const h of room.hotspots) {
        if (h.targetRoomId !== undefined) expect(roomIds.has(h.targetRoomId)).toBe(true);
        if (h.endingId !== undefined) expect(endingIds.has(h.endingId)).toBe(true);
        if (h.hiddenUntilSolved !== undefined) {
          const exists = ROOMS.some((r) => r.hotspots.some((x) => x.id === h.hiddenUntilSolved));
          expect(exists).toBe(true);
        }
      }
    }
  });

  it('食料の置き場所が実在する部屋である', () => {
    const roomIds = new Set(ROOMS.map((r) => r.id));
    for (const food of FOODS) expect(roomIds.has(food.roomId)).toBe(true);
  });

  it('ホットスポットの矩形が画面内に収まっている', () => {
    const areas = [
      ...ROOMS.flatMap((r) => r.hotspots.map((h) => h.area)),
      ...FOODS.map((f) => f.area),
    ];
    for (const a of areas) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(100);
      expect(a.y + a.h).toBeLessThanOrEqual(100);
    }
  });
});
