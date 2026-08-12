import { FOODS, START_ROOM_ID, getFood, getRoom } from './rooms';
import {
  ABILITY_GAINED_NOTICE,
  ABILITY_LOST_NOTICE,
  MAX_STAGE,
  gainedAbilities,
  hasAbility,
  lostAbilities,
  weightOf,
} from './stages';
import type { GameAction, GameState, Hotspot, Stage } from './types';

const LOG_LIMIT = 20;

const OPENING_LINE = '背後で隔壁が落ちた。押しても引いても、もう動かない。';

export function createInitialState(): GameState {
  return {
    stage: 1,
    currentRoomId: START_ROOM_ID,
    consumedFoodIds: FOODS.filter((f) => f.consumed).map((f) => f.id),
    visitedRoomIds: [START_ROOM_ID],
    log: [OPENING_LINE],
    solvedHotspotIds: [],
    pendingFoodId: null,
    endingId: null,
  };
}

function withLog(state: GameState, ...lines: string[]): GameState {
  if (lines.length === 0) return state;
  return { ...state, log: [...state.log, ...lines].slice(-LOG_LIMIT) };
}

/** requires を満たさない時の既定テキスト */
function defaultFailText(hotspot: Hotspot): string {
  return `${hotspot.label}に手をかけたが、この体では扱えなかった。`;
}

function isSolved(state: GameState, hotspotId: string): boolean {
  return state.solvedHotspotIds.includes(hotspotId);
}

/** 表示・操作の対象になるか（hiddenUntilSolved の解決） */
export function isHotspotAvailable(state: GameState, hotspot: Hotspot): boolean {
  if (hotspot.hiddenAfterSolved === true && isSolved(state, hotspot.id)) return false;
  return hotspot.hiddenUntilSolved === undefined || isSolved(state, hotspot.hiddenUntilSolved);
}

function useHotspot(state: GameState, hotspotId: string): GameState {
  const room = getRoom(state.currentRoomId);
  const hotspot = room.hotspots.find((h) => h.id === hotspotId);
  if (!hotspot) return state;
  if (!isHotspotAvailable(state, hotspot)) return state;

  if (hotspot.requires !== undefined && !hasAbility(state.stage, hotspot.requires)) {
    return withLog(state, hotspot.failText ?? defaultFailText(hotspot));
  }

  if (hotspot.endingId !== undefined) {
    return { ...state, endingId: hotspot.endingId, pendingFoodId: null };
  }

  if (hotspot.targetRoomId !== undefined) {
    const target = getRoom(hotspot.targetRoomId);
    const visited = state.visitedRoomIds.includes(target.id)
      ? state.visitedRoomIds
      : [...state.visitedRoomIds, target.id];
    return withLog(
      { ...state, currentRoomId: target.id, visitedRoomIds: visited },
      `${target.name}へ移動した。`,
    );
  }

  // その場で解決するギミック
  if (isSolved(state, hotspot.id)) {
    return withLog(state, `${hotspot.label}は、すでに片が付いている。`);
  }
  return withLog(
    { ...state, solvedHotspotIds: [...state.solvedHotspotIds, hotspot.id] },
    hotspot.resolveText ?? `${hotspot.label}を動かした。`,
  );
}

function eat(state: GameState): GameState {
  const foodId = state.pendingFoodId;
  if (foodId === null) return state;

  const cleared: GameState = { ...state, pendingFoodId: null };
  if (state.consumedFoodIds.includes(foodId)) return cleared;

  const food = getFood(foodId);
  const from = state.stage;
  const to = Math.min(from + food.stageGain, MAX_STAGE) as Stage;

  const notices: string[] = [
    food.eatText,
    `体重 ${weightOf(to)}kg。`,
    ...gainedAbilities(from, to).map((a) => ABILITY_GAINED_NOTICE[a] ?? ''),
    ...lostAbilities(from, to).map((a) => ABILITY_LOST_NOTICE[a] ?? ''),
  ].filter((line) => line !== '');

  // TODO(段階4〜6): 段階6に到達したら自動でエンディングへ遷移させる（仕様書 §3）。
  // プロトタイプの食料は2つだけなので段階3止まり。食料を追加する前に実装すること。
  return withLog(
    {
      ...cleared,
      stage: to,
      consumedFoodIds: [...state.consumedFoodIds, foodId],
    },
    ...notices,
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'RESTART') return createInitialState();
  if (state.endingId !== null) return state; // エンディング後は操作を受け付けない

  switch (action.type) {
    case 'USE_HOTSPOT':
      return useHotspot(state, action.hotspotId);

    case 'REQUEST_EAT': {
      if (state.consumedFoodIds.includes(action.foodId)) return state;
      return { ...state, pendingFoodId: action.foodId };
    }

    case 'CANCEL_EAT':
      return { ...state, pendingFoodId: null };

    case 'CONFIRM_EAT':
      return eat(state);

    default:
      return state;
  }
}
