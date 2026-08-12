import { Figure } from '../art/Figure';
import { RoomArt } from '../art/RoomArt';
import { foodsInRoom } from '../game/rooms';
import { isHotspotAvailable } from '../game/reducer';
import type { GameState, Room } from '../game/types';

/** 部屋ごとの光源。人物の陰影も部屋の光に合わせる（仕様書 §8：光源はひとつ） */
const LIGHT: Record<string, { from: 'left' | 'right'; color: string; x: number; bottom: number }> = {
  mess_hall: { from: 'left', color: '#A89880', x: 68, bottom: 6 },
  storage: { from: 'left', color: '#A89880', x: 27, bottom: 4 },
  power_room: { from: 'right', color: '#B08268', x: 25, bottom: 3 },
};

interface Props {
  state: GameState;
  room: Room;
  onHotspot: (hotspotId: string) => void;
  onFood: (foodId: string) => void;
}

export function RoomScene({ state, room, onHotspot, onFood }: Props) {
  const light = LIGHT[room.id] ?? { from: 'left' as const, color: '#A89880', x: 60, bottom: 5 };
  const foods = foodsInRoom(room.id);

  return (
    <div className="scene" key={room.id}>
      <RoomArt roomId={room.id} solvedHotspotIds={state.solvedHotspotIds} />

      <Figure
        stage={state.stage}
        lightFrom={light.from}
        lightColor={light.color}
        className="scene__figure"
        // 位置は部屋ごと。viewBox は固定なので段階が変わっても縮尺は動かない
        style={{ left: `${light.x}%`, bottom: `${light.bottom}%` }}
      />

      <div className="scene__hotspots">
        {room.hotspots
          .filter((h) => isHotspotAvailable(state, h))
          .map((h) => (
            <button
              key={h.id}
              type="button"
              className="hotspot"
              style={{
                left: `${h.area.x}%`,
                top: `${h.area.y}%`,
                width: `${h.area.w}%`,
                height: `${h.area.h}%`,
              }}
              onClick={() => onHotspot(h.id)}
            >
              <span className="hotspot__label">{h.label}</span>
            </button>
          ))}

        {foods.map((f) => {
          const eaten = state.consumedFoodIds.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              className={`hotspot${eaten ? ' hotspot--spent' : ''}`}
              style={{
                left: `${f.area.x}%`,
                top: `${f.area.y}%`,
                width: `${f.area.w}%`,
                height: `${f.area.h}%`,
              }}
              onClick={() => onFood(f.id)}
              disabled={eaten}
            >
              <span className="hotspot__label">{f.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
