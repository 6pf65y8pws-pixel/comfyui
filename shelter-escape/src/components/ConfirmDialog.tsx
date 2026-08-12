import { useEffect, useRef } from 'react';
import type { FoodItem } from '../game/types';

/**
 * 食べる前の確認（仕様書 §7）。
 * 「戻れない」ことを毎回明示する。既定のフォーカスは「やめる」側に置く。
 */
export function ConfirmDialog({
  food,
  currentKg,
  nextKg,
  onConfirm,
  onCancel,
}: {
  food: FoodItem;
  currentKg: number;
  nextKg: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal__sheet">
        <h2 className="modal__title" id="confirm-title">
          {food.label}を食べる
        </h2>
        <p className="modal__text">{food.confirmText}</p>
        <p className="modal__warn">
          {currentKg}kg <span aria-hidden="true">→</span> {nextKg}kg。元には戻らない。
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            食べる
          </button>
          <button type="button" className="btn" ref={cancelRef} onClick={onCancel}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}
