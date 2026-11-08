import { useState } from 'react';
import { today } from '../../shared/date';
import type { DailyStat } from '../../shared/types';
import { useStatsDaily } from '../api/hooks';
import { KcalChart, PfcChart, SparseLineChart, WeightChart } from '../components/charts';
import { ErrorNotice } from '../components/Feedback';
import { filterRange, RangeSelector, type RangeKey } from '../components/RangeSelector';
import { WeeklySummary } from '../components/WeeklySummary';

const pickFat = (d: DailyStat) => d.bodyFatPct;
const pickLbm = (d: DailyStat) => d.leanBodyMassKg;
const pickFatMass = (d: DailyStat) => d.fatMassKg;

const RANGE_STORAGE_KEY = 'power.chartRange';

function loadRange(): RangeKey {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY);
    if (v === '7d' || v === '30d' || v === '90d' || v === 'all') return v;
  } catch {
    /* 保存できない環境でも動くように */
  }
  return '30d';
}

export function ChartsPage() {
  const stats = useStatsDaily();
  const [range, setRange] = useState<RangeKey>(loadRange);
  const days = filterRange(stats.data ?? [], range, today());

  const onChange = (k: RangeKey) => {
    setRange(k);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, k);
    } catch {
      /* noop */
    }
  };

  const empty = '体重と体脂肪率を同じ日に記録すると表示されます';

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>グラフ</h1>
        <span className="spacer" />
        <RangeSelector value={range} onChange={onChange} />
      </div>
      <ErrorNotice error={stats.error} />

      <div className="card chart-card">
        <h2>体重</h2>
        <WeightChart days={days} height={300} />
      </div>

      <div className="card chart-card">
        <h2>体脂肪率</h2>
        <SparseLineChart days={days} pick={pickFat} label="体脂肪率" unit="%" color="series2" emptyText="この期間の体脂肪率の記録はまだありません" />
      </div>

      <div className="grid-2">
        <div className="card chart-card">
          <h2>除脂肪体重</h2>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            筋肉量の目安。維持・増加していれば順調です
          </p>
          <SparseLineChart days={days} pick={pickLbm} label="除脂肪体重" unit="kg" color="series1" emptyText={empty} />
        </div>
        <div className="card chart-card">
          <h2>体脂肪量</h2>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            減っていれば脂肪が落ちています
          </p>
          <SparseLineChart days={days} pick={pickFatMass} label="体脂肪量" unit="kg" color="series2" emptyText={empty} />
        </div>
      </div>

      <div className="card chart-card">
        <h2>摂取カロリー</h2>
        <KcalChart days={days} />
      </div>

      <div className="card chart-card">
        <h2>PFC バランス</h2>
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          1日ごとの P・F・C をカロリー換算で積み上げています
        </p>
        <PfcChart days={days} />
      </div>

      <div className="card">
        <h2>週ごとのまとめ</h2>
        <WeeklySummary days={stats.data ?? []} from={days[0]?.date ?? null} />
      </div>
    </div>
  );
}
