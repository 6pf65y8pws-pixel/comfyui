import { Figure } from '../art/Figure';
import type { Ending, Stage } from '../game/types';

/** エンディング。どれが正解ということはない（仕様書 §4） */
export function EndingScreen({
  ending,
  stage,
  weightKg,
  onRestart,
}: {
  ending: Ending;
  stage: Stage;
  weightKg: number;
  onRestart: () => void;
}) {
  return (
    <div className="ending">
      <div className="ending__figure">
        <Figure stage={stage} lightFrom="left" contactShadow={false} />
      </div>
      <div className="ending__text">
        <p className="ending__label">脱出</p>
        <h1 className="ending__title">{ending.title}</h1>
        {ending.text.split('\n\n').map((para, i) => (
          <p key={i} className="ending__body">
            {para}
          </p>
        ))}
        <p className="ending__weight">最終体重 {weightKg}kg</p>
        <button type="button" className="btn" onClick={onRestart}>
          もう一度
        </button>
      </div>
    </div>
  );
}
