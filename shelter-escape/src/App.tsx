import { useReducer } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EndingScreen } from './components/EndingScreen';
import { RoomScene } from './components/RoomScene';
import { StatusBar } from './components/StatusBar';
import { TextPanel } from './components/TextPanel';
import { createInitialState, gameReducer } from './game/reducer';
import { getEnding, getFood, getRoom } from './game/rooms';
import { MAX_STAGE, weightOf } from './game/stages';
import type { Stage } from './game/types';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  if (state.endingId !== null) {
    return (
      <EndingScreen
        ending={getEnding(state.endingId)}
        stage={state.stage}
        weightKg={weightOf(state.stage)}
        onRestart={() => dispatch({ type: 'RESTART' })}
      />
    );
  }

  const room = getRoom(state.currentRoomId);
  const pending = state.pendingFoodId === null ? null : getFood(state.pendingFoodId);
  const nextStage = Math.min(state.stage + 1, MAX_STAGE) as Stage;

  return (
    <div className="app">
      <div className="frame">
        <RoomScene
          state={state}
          room={room}
          onHotspot={(hotspotId) => dispatch({ type: 'USE_HOTSPOT', hotspotId })}
          onFood={(foodId) => dispatch({ type: 'REQUEST_EAT', foodId })}
        />
        <StatusBar roomName={room.name} weightKg={weightOf(state.stage)} />
        <TextPanel bodyText={room.bodyText} log={state.log} />
      </div>

      {pending !== null && (
        <ConfirmDialog
          food={pending}
          currentKg={weightOf(state.stage)}
          nextKg={weightOf(nextStage)}
          onConfirm={() => dispatch({ type: 'CONFIRM_EAT' })}
          onCancel={() => dispatch({ type: 'CANCEL_EAT' })}
        />
      )}
    </div>
  );
}
