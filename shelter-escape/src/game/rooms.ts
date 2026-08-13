import type { Ending, FoodItem, Room } from './types';

/**
 * 部屋・食料・エンディングの定数定義（仕様書 §5 / §9）。
 * ロジックは一切書かない。ここはデータだけ。
 *
 * プロトタイプ範囲（仕様書 §10-2）:
 *   部屋3つ / 段階3まで / エンディングは「通風ダクト」と「非常階段」の2つ。
 *   非常階段を含めているのは、段階3で食料を使い切ったプレイヤーに出口を残すため
 *   （§6「詰み防止の保証」）。段階4〜6と主搬入口は次のフェーズ。
 */

export const START_ROOM_ID = 'mess_hall';

export const ROOMS: readonly Room[] = [
  {
    id: 'mess_hall',
    name: '食堂',
    bodyText:
      '配膳台の上に缶詰が積み上がっている。数十年分。ラベルの文字はほとんど褪せている。' +
      '天井近くに通風ダクトの格子。ライトの光は、その奥までは届かない。',
    hotspots: [
      {
        id: 'mess_duct',
        label: '通風ダクト',
        requires: 'duct',
        endingId: 'ending_duct',
        area: { x: 19.6, y: 19.5, w: 15.5, h: 19 },
        failText:
          '格子を外し、肩から入れてみる。胸のあたりでつかえた。息を吐いても、もう幅が足りない。',
      },
      {
        id: 'mess_to_storage',
        label: '保管庫へ続く扉',
        targetRoomId: 'storage',
        area: { x: 42.8, y: 26.5, w: 13.2, h: 43 },
      },
    ],
  },
  {
    id: 'storage',
    name: '保管庫',
    bodyText:
      '天井まである鋼製の棚が、通路の口を塞いでいる。棚板には軍用レーションの箱が詰まったままだ。' +
      '固定はされていない。押せば動く。動かせる体であれば。',
    hotspots: [
      {
        id: 'storage_shelf',
        label: '鋼製の棚',
        requires: 'push',
        hiddenAfterSolved: true,
        area: { x: 49, y: 20.5, w: 19, h: 48.5 },
        failText:
          '肩を当てて押す。棚は軋んだだけで、位置を変えなかった。足りないのは力ではなく、重さだ。',
        resolveText:
          '全体重を預ける。棚は床を削りながら、数センチずつ横へ逃げた。その脇に通路が口を開ける。',
      },
      {
        id: 'storage_passage',
        label: '棚の脇の通路',
        targetRoomId: 'power_room',
        hiddenUntilSolved: 'storage_shelf',
        area: { x: 48.6, y: 25, w: 13.8, h: 44.5 },
      },
      {
        id: 'storage_to_mess',
        label: '食堂へ戻る扉',
        targetRoomId: 'mess_hall',
        area: { x: 20.5, y: 26.5, w: 12, h: 43 },
      },
    ],
  },
  {
    id: 'power_room',
    name: '配電室',
    bodyText:
      '壁一面の配電盤。生きているのは非常灯だけで、赤い光が計器の面をなぞっている。' +
      '床の中央に円形の圧力プレート。その先の隔壁は、閉じたままだ。',
    hotspots: [
      {
        id: 'power_plate',
        label: '圧力プレート',
        requires: 'plate',
        area: { x: 32.5, y: 77, w: 25.5, h: 15.5 },
        failText:
          'プレートに乗る。針は震えたが、規定値の手前で止まった。脇の銘板に「95kg」とある。',
        resolveText: 'プレートが沈み、奥で空気の抜ける音がした。隔壁がゆっくりと持ち上がる。',
      },
      {
        id: 'power_stairs',
        label: '非常階段',
        requires: 'climb',
        endingId: 'ending_stairs',
        hiddenUntilSolved: 'power_plate',
        area: { x: 59.5, y: 25.5, w: 18, h: 44 },
        failText: '踏み板の幅を見る。手すりを掴んでも、この体を上まで運べる気がしない。',
      },
      {
        id: 'power_to_storage',
        label: '保管庫へ戻る通路',
        targetRoomId: 'storage',
        area: { x: 10.8, y: 26, w: 8.5, h: 49 },
      },
    ],
  },
] as const;

export const FOODS: readonly FoodItem[] = [
  {
    id: 'food_cans',
    roomId: 'mess_hall',
    label: '缶詰の山',
    stageGain: 1,
    consumed: false,
    area: { x: 9.5, y: 40, w: 17, h: 18.5 },
    confirmText:
      '中身は脂と塩の塊だ。腹に入れれば体は作られ、その体はもう元には戻らない。' +
      '今できることのいくつかは、できなくなる。',
    eatText: '缶を開け、冷えたまま食べた。体の芯が重くなっていく。',
  },
  {
    id: 'food_ration',
    roomId: 'storage',
    label: '軍用レーション',
    stageGain: 1,
    consumed: false,
    area: { x: 71, y: 63.5, w: 22.5, h: 29 },
    confirmText:
      '一食分が四千キロカロリー。設計通りに体は増える。増えた分は、二度と減らない。' +
      '今できることのいくつかは、できなくなる。',
    eatText: '箱を破り、固形の塊を流し込む。手足の先まで、鈍く膨れていく感覚がある。',
  },
] as const;

export const ENDINGS: readonly Ending[] = [
  {
    id: 'ending_duct',
    title: '通風ダクト',
    text:
      '格子を外し、肩から先に入る。二十メートルほど這ったところで、埃ではない空気の匂いがした。' +
      '斜面に転がり出て、地上の光を見る。\n\n' +
      '何も持ち出せなかった。あの記録も、缶詰のひとつも。体ひとつで外に出た。',
  },
  {
    id: 'ending_stairs',
    title: '非常階段',
    text:
      '隔壁の奥に、非常階段。手すりは錆びていたが、体は支えられた。' +
      '一段ずつ、息を整えながら上がる。踊り場の窓に、朝の色がある。\n\n' +
      'ダクトの格子はもう二度と通れない。それでも、上まで運べる体ではあった。',
  },
] as const;

export function getRoom(roomId: string): Room {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) throw new Error(`未定義の部屋: ${roomId}`);
  return room;
}

export function getFood(foodId: string): FoodItem {
  const food = FOODS.find((f) => f.id === foodId);
  if (!food) throw new Error(`未定義の食料: ${foodId}`);
  return food;
}

export function getEnding(endingId: string): Ending {
  const ending = ENDINGS.find((e) => e.id === endingId);
  if (!ending) throw new Error(`未定義のエンディング: ${endingId}`);
  return ending;
}

export function foodsInRoom(roomId: string): FoodItem[] {
  return FOODS.filter((f) => f.roomId === roomId);
}
