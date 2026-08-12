import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Figure } from '../art/Figure';
import { PHYSIQUES } from '../art/physique';
import type { Stage } from '../game/types';

/**
 * 開発用の体型シート。本編のビルドには含まれない（vite は index.html だけを入口にする）。
 * 6段階を並べて、関節位置のズレ・輪郭の破綻・段階間の飛びを目視で確認するためのページ。
 */
function Sheet() {
  return (
    <div className="sheet">
      <h1>体型シート</h1>
      <div className="row">
        {PHYSIQUES.map((p) => (
          <figure key={p.stage}>
            <Figure stage={p.stage as Stage} height={420} lightFrom="left" />
            <figcaption>
              <b>{p.weightKg}kg</b>
              <span>{p.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="row row--grid">
        {PHYSIQUES.map((p) => (
          <div key={p.stage} className="grid">
            <Figure stage={p.stage as Stage} height={420} lightFrom="left" contactShadow={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Sheet />
    </StrictMode>,
  );
}
