// src/components/PinPad.tsx
import React from 'react';

export default function PinPad({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const push = (d: string) => {
    if (value.length >= 4) return;
    onChange(value + d);
  };
  const back = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','×'];

  return (
    <>
      <div className="pin-circles" aria-label="PIN">
        {[0,1,2,3].map(i => (
          <span key={i} className={'dot' + (i < value.length ? ' filled' : '')} />
        ))}
      </div>

      <div className="pin-pad">
        {keys.map((k, i) => {
          let onClick = () => {};
          if (k === '←') onClick = back;
          else if (k === '×') onClick = clear;
          else onClick = () => push(k);

          return (
            <button
              type="button"
              key={i}
              onClick={onClick}
              className={k === '←' || k === '×' ? 'muted-btn' : undefined}
            >
              {k}
            </button>
          );
        })}
      </div>
    </>
  );
}
