import { FOODS, ROOMS, getRoom } from './rooms';
import { createInitialState, gameReducer, isHotspotAvailable } from './reducer';
import type { GameAction, GameState } from './types';

/**
 * 到達可能な状態を全部たどる。
 *
 * 仕様書 §6 の「詰み防止の保証：どの段階からも最低1つのエンディングに到達できること」を
 * 目視ではなく機械的に確認するために使う。部屋や食料を足したらテストが落ちる。
 */

export interface StateNode {
  key: string;
  state: GameState;
  /** この状態から直接エンディングに入れるか */
  reachesEndingDirectly: boolean;
  nextKeys: string[];
}

function keyOf(s: GameState): string {
  return [
    s.stage,
    s.currentRoomId,
    [...s.consumedFoodIds].sort().join(','),
    [...s.solvedHotspotIds].sort().join(','),
  ].join('|');
}

/** その状態で選べる操作（ログや確認ダイアログは状態空間に含めない） */
function actionsFor(state: GameState): GameAction[] {
  const room = getRoom(state.currentRoomId);
  const actions: GameAction[] = room.hotspots
    .filter((h) => isHotspotAvailable(state, h))
    .map((h) => ({ type: 'USE_HOTSPOT', hotspotId: h.id }));

  for (const food of FOODS) {
    if (food.roomId === state.currentRoomId && !state.consumedFoodIds.includes(food.id)) {
      actions.push({ type: 'REQUEST_EAT', foodId: food.id });
    }
  }
  return actions;
}

function applyAction(state: GameState, action: GameAction): GameState {
  if (action.type === 'REQUEST_EAT') {
    return gameReducer(gameReducer(state, action), { type: 'CONFIRM_EAT' });
  }
  return gameReducer(state, action);
}

export function exploreAll(): Map<string, StateNode> {
  const nodes = new Map<string, StateNode>();
  const queue: GameState[] = [createInitialState()];

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;
    const key = keyOf(state);
    if (nodes.has(key)) continue;

    const node: StateNode = { key, state, reachesEndingDirectly: false, nextKeys: [] };
    nodes.set(key, node);

    for (const action of actionsFor(state)) {
      const next = applyAction(state, action);
      if (next.endingId !== null) {
        node.reachesEndingDirectly = true;
        continue; // エンディングは終端。そこから先は無い
      }
      const nextKey = keyOf(next);
      if (nextKey === key) continue; // 失敗テキストだけで状態が変わらない操作
      node.nextKeys.push(nextKey);
      if (!nodes.has(nextKey)) queue.push(next);
    }
  }
  return nodes;
}

/** エンディングに到達できない状態（＝詰み）を列挙する。空であること */
export function findDeadEnds(): StateNode[] {
  const nodes = exploreAll();

  const safe = new Set<string>();
  for (const node of nodes.values()) {
    if (node.reachesEndingDirectly) safe.add(node.key);
  }

  // エンディングに繋がる状態を後ろ向きに広げる
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes.values()) {
      if (safe.has(node.key)) continue;
      if (node.nextKeys.some((k) => safe.has(k))) {
        safe.add(node.key);
        grew = true;
      }
    }
  }

  return [...nodes.values()].filter((n) => !safe.has(n.key));
}

/** 到達可能な部屋（孤立した部屋を検出する） */
export function reachableRoomIds(): Set<string> {
  const rooms = new Set<string>();
  for (const node of exploreAll().values()) rooms.add(node.state.currentRoomId);
  return rooms;
}

export const ALL_ROOM_IDS = ROOMS.map((r) => r.id);
