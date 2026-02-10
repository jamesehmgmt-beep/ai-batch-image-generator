'use client';

import { useState, useEffect, useRef } from 'react';

export interface ETAResult {
  estimatedSecondsRemaining: number;
  averageSecondsPerGeneration: number;
  formattedETA: string;
  isCalculating: boolean;
}

const MIN_COMPLETIONS_FOR_ETA = 3;
const DEFAULT_SECONDS_PER_GEN = 60;

export function useETACalculator(
  completed: number,
  total: number,
  startTime: string | null
): ETAResult {
  const [eta, setEta] = useState<ETAResult>({
    estimatedSecondsRemaining: 0,
    averageSecondsPerGeneration: DEFAULT_SECONDS_PER_GEN,
    formattedETA: 'Calculating...',
    isCalculating: true,
  });

  const lastCompletedRef = useRef(completed);

  useEffect(() => {
    // Not enough data yet
    if (!startTime || completed < MIN_COMPLETIONS_FOR_ETA) {
      const remaining = total - completed;
      setEta({
        estimatedSecondsRemaining: remaining * DEFAULT_SECONDS_PER_GEN,
        averageSecondsPerGeneration: DEFAULT_SECONDS_PER_GEN,
        formattedETA: 'Calculating...',
        isCalculating: true,
      });
      return;
    }

    const now = Date.now();
    const startMs = new Date(startTime).getTime();
    const elapsedSeconds = (now - startMs) / 1000;

    // Calculate average time per completed generation
    const avgSecondsPerGen = elapsedSeconds / completed;

    // Estimate remaining time
    const remaining = total - completed;
    const estimatedRemaining = remaining * avgSecondsPerGen;

    setEta({
      estimatedSecondsRemaining: Math.round(estimatedRemaining),
      averageSecondsPerGeneration: Math.round(avgSecondsPerGen),
      formattedETA: formatSeconds(estimatedRemaining),
      isCalculating: false,
    });

    lastCompletedRef.current = completed;
  }, [completed, total, startTime]);

  return eta;
}

function formatSeconds(seconds: number): string {
  if (seconds < 0) return '0 sec';
  if (seconds < 60) return `${Math.round(seconds)} sec`;

  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);

  if (min < 60) {
    return sec > 0 ? `${min} min ${sec} sec` : `${min} min`;
  }

  const hours = Math.floor(min / 60);
  const remainingMin = min % 60;

  if (remainingMin > 0) {
    return `${hours} hr ${remainingMin} min`;
  }
  return `${hours} hr`;
}
