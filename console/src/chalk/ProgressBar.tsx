import type { ReactNode } from 'react';

export function ChalkProgressBar({ value, additionalInfo, description }: { value: number; additionalInfo?: ReactNode; description?: ReactNode }) {
  return (
    <div>
      <div className="chalk-progress">
        <div className="chalk-progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      {additionalInfo && <div className="chalk-progress-info">{additionalInfo}</div>}
    </div>
  );
}
