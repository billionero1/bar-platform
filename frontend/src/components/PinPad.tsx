// src/components/PinPad.tsx
import React from 'react';

type PinPadProps = {
  value: string;               // текущий PIN (строка из цифр)
  disabled?: boolean;
  canUseFaceId?: boolean;
  onChange: (next: string) => void;
  onFaceId?: () => void;
  onLogout?: () => void;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const PinPad: React.FC<PinPadProps> = ({
  value,
  disabled,
  canUseFaceId,
  onChange,
  onFaceId,
  onLogout,
}) => {
  const handleDigit = (d: string) => {
    if (disabled) return;
    if (value.length >= 4) return;
    onChange((value + d).slice(0, 4));
  };

  const handleBackspace = () => {
    if (disabled) return;
    if (!value.length) return;
    onChange(value.slice(0, -1));
  };

  // Face ID показываем только если:
  // - можно его использовать
  // - есть коллбек
  // - сейчас не введено ни одной цифры
  const showFaceId = !!canUseFaceId && !!onFaceId && value.length === 0;

  // Backspace — когда есть хотя бы одна цифра
  const showBackspace = value.length > 0;

  return (
    <div className="pinpad">
      {/* Индикаторы 4 цифр */}
      <div className="pinpad__dots">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={
              'pinpad__dot' +
              (value.length > i ? ' pinpad__dot--filled' : '')
            }
          />
        ))}
      </div>

      {/* Сетка цифр */}
      <div className="pinpad__grid">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className="pinpad__key"
            disabled={disabled}
            onClick={() => handleDigit(d)}
          >
            {d}
          </button>
        ))}

        {/* Левый нижний слот:
            - на оверлее: текстовая кнопка "Выйти" без «таблетки»
            - на регистрации: пустая ячейка */}
        {onLogout ? (
          <button
            type="button"
            className="pinpad__aux pinpad__aux--logout"
            disabled={disabled}
            onClick={onLogout}
          >
            Выйти
          </button>
        ) : (
          <div className="pinpad__aux-placeholder" />
        )}

        {/* Центр — 0 (остаётся круглой кнопкой) */}
        <button
          type="button"
          className="pinpad__key"
          disabled={disabled}
          onClick={() => handleDigit('0')}
        >
          0
        </button>

        {/* Правый нижний слот:
            - Face ID (если доступен и PIN пустой) — без таблетки
            - либо Backspace (если есть цифры) — без таблетки
            - либо пустая ячейка */}
        {showFaceId ? (
          <button
            type="button"
            className="pinpad__aux pinpad__aux--faceid"
            disabled={disabled}
            onClick={onFaceId}
          >
            <span className="pinpad__faceid">Face ID</span>
          </button>
        ) : showBackspace ? (
          <button
            type="button"
            className="pinpad__aux pinpad__aux--backspace"
            disabled={disabled}
            onClick={handleBackspace}
          >
            <span className="pinpad__backspace">⌫</span>
          </button>
        ) : (
          <div className="pinpad__aux-placeholder" />
        )}
      </div>
    </div>
  );
};

export default PinPad;
