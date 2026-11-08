import { Link } from 'react-router';
import type { Nutrients } from '../../shared/calc';
import type { Goal } from '../../shared/types';
import { fmtG } from '../utils/num';

const ROWS = [
  { key: 'kcal', label: 'カロリー', unit: 'kcal' },
  { key: 'proteinG', label: 'P（たんぱく質）', unit: 'g' },
  { key: 'fatG', label: 'F（脂質）', unit: 'g' },
  { key: 'carbsG', label: 'C（炭水化物）', unit: 'g' },
] as const;

/** 摂取量と目標の比較。目標が未設定なら摂取量だけを表示する */
export function IntakeProgress({ intake, goal }: { intake: Nutrients; goal: Goal | null }) {
  return (
    <div className="intake">
      {ROWS.map((r) => {
        const v = intake[r.key];
        const g = goal ? goal[r.key] : null;
        const pct = g ? Math.round((v / g) * 100) : null;
        const over = pct != null && pct > 100;
        const val = r.key === 'kcal' ? v.toLocaleString() : fmtG(Math.round(v));
        return (
          <div className="intake-row" key={r.key}>
            <span className="intake-label">{r.label}</span>
            <span className="intake-value">
              <strong>{val}</strong>
              {g != null && <span className="muted"> / {r.key === 'kcal' ? g.toLocaleString() : fmtG(g)}</span>} {r.unit}
            </span>
            {pct != null && (
              <>
                <span
                  className="progress"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${r.label} ${pct}%`}
                >
                  <span className={`progress-fill${over ? ' over' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </span>
                <span className={`intake-pct${over ? ' over' : ''}`}>{pct}%</span>
              </>
            )}
          </div>
        );
      })}
      {!goal && (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          <Link to="/settings">目標・設定</Link> で目標を設定すると達成率が表示されます。
        </p>
      )}
    </div>
  );
}
