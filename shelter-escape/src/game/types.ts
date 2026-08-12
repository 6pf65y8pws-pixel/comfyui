/**
 * 型定義（仕様書 §6）。
 *
 * 仕様書に無い追加フィールドは「追加」コメントを付けている。追加は次の2種類だけ:
 *   1. 描画専用データ（area など）— ロジックは一切参照しない
 *   2. その場で解決するギミックの状態（solvedHotspotIds / hiddenUntilSolved）
 */

export type Ability = 'push' | 'plate' | 'breakFloor' | 'heavyDoor' | 'duct' | 'climb' | 'run';

export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export interface StageDef {
  stage: Stage;
  weightKg: number;
  abilities: Ability[]; // その段階で使える能力の全リスト
}

/** 背景に対する矩形。単位は % （追加：描画専用） */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FoodItem {
  id: string;
  roomId: string;
  label: string; // 「軍用レーション」など
  stageGain: 1; // 常に1段階。複数段階を一度に上げない
  consumed: boolean; // 初期値。実行時の真値は GameState.consumedFoodIds
  area: Area; // 追加：描画専用
  confirmText: string; // 追加：確認ダイアログ本文
  eatText: string; // 追加：食べた直後のログ
}

export interface Hotspot {
  id: string;
  label: string;
  requires?: Ability; // 未所持なら失敗テキストを表示
  targetRoomId?: string; // 移動先。無ければその場で解決するギミック
  endingId?: string; // 出口の場合
  area: Area; // 追加：描画専用
  failText?: string; // 追加：requires を満たさない時のテキスト
  resolveText?: string; // 追加：その場で解決するギミックの成功テキスト
  hiddenUntilSolved?: string; // 追加：この hotspot が解決されるまで存在しない
  hiddenAfterSolved?: boolean; // 追加：解決済みになったら消える（動かした棚など）
}

export interface Room {
  id: string;
  name: string;
  bodyText: string; // 部屋に入った時の描写
  hotspots: Hotspot[];
}

export interface Ending {
  id: string;
  title: string;
  text: string;
}

export interface GameState {
  stage: Stage;
  currentRoomId: string;
  consumedFoodIds: string[];
  visitedRoomIds: string[];
  log: string[]; // 直近の出来事。UI下部に表示

  // --- 以下は追加 ---
  solvedHotspotIds: string[]; // その場で解決したギミック
  pendingFoodId: string | null; // 確認ダイアログ表示中の食料
  endingId: string | null; // 到達したエンディング
}

export type GameAction =
  | { type: 'USE_HOTSPOT'; hotspotId: string }
  | { type: 'REQUEST_EAT'; foodId: string }
  | { type: 'CANCEL_EAT' }
  | { type: 'CONFIRM_EAT' }
  | { type: 'RESTART' };
