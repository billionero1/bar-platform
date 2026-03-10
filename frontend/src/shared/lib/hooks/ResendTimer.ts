// src/hooks/useResendTimer.ts
import { useCallback, useEffect, useState } from 'react';

export type UseResendTimerOptions = {
  /** Базовая задержка, по умолчанию 30 секунд */
  defaultDelaySec?: number;
  /** Интервал обновления таймера, по умолчанию 500 мс */
  tickMs?: number;
};

export type UseResendTimerResult = {
  /** Можно ли сейчас отправить код ещё раз */
  canResend: boolean;
  /** Сколько секунд осталось до возможности повторной отправки */
  leftSec: number;
  /** Запустить/перезапустить таймер, опционально с собственной задержкой */
  start: (delaySec?: number) => void;
  /** Полностью сбросить таймер (будет canResend = true, leftSec = 0) */
  reset: () => void;
};

export function useResendTimer(
  options: UseResendTimerOptions = {},
): UseResendTimerResult {
  const { defaultDelaySec = 30, tickMs = 500 } = options;

  const [resendAt, setResendAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTs(Date.now());
    }, tickMs);

    return () => {
      window.clearInterval(id);
    };
  }, [tickMs]);

  const leftSec = resendAt
    ? Math.max(0, Math.ceil((resendAt - nowTs) / 1000))
    : 0;

  const canResend = !resendAt || leftSec === 0;

  const start = useCallback(
    (delaySec?: number) => {
      const delay = (delaySec ?? defaultDelaySec) * 1000;
      setResendAt(Date.now() + delay);
    },
    [defaultDelaySec],
  );

  const reset = useCallback(() => {
    setResendAt(null);
  }, []);

  return { canResend, leftSec, start, reset };
}
