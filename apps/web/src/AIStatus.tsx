import {useEffect, useState} from 'react';
import {api} from './api';

type Props = {refreshToken: boolean; onAvailable: (available: boolean) => void};
export function AIStatus({refreshToken, onAvailable}: Props): React.JSX.Element {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.aiStatus>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const result = await api.aiStatus();
        if (!active) return;
        setStatus(result); setFailed(false);
        onAvailable(result.configured && !result.paused && result.remainingMicros > 0 && result.dailyAttempts < 10);
      } catch { if (active) { setFailed(true); onAvailable(false); } }
    };
    void load();
    const interval = setInterval(() => { void load(); }, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [refreshToken, onAvailable]);
  const money = (micros: number): string => '$' + (micros / 1_000_000).toFixed(2);
  return <div className="ai-budget" aria-label="AI trial budget">
    <strong>AI trial</strong> {status ? `${money(status.remainingMicros)} of ${money(status.limitMicros)} available` : 'Checking balance…'}
    {status && <small>{status.dailyAttempts}/10 attempts today · {status.configured ? 'Configured' : 'Key setup required'}
      {status.paused && ' · Paused: a charge is pending or unknown'}
      {status.reservedMicros > 0 && ` · ${money(status.reservedMicros)} reserved`}</small>}
    {failed && <small role="status">Balance unavailable. AI requests paused.</small>}
  </div>;
}
