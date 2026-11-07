import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { useEffect, useMemo, useState } from 'react';
import { Bar, Chart, Line } from 'react-chartjs-2';
import { formatShort } from '../../shared/date';
import type { DailyStat } from '../../shared/types';
import { fmtG } from '../utils/num';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip);

type Colors = {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  series1: string;
  series1Soft: string;
  series2: string;
  series3: string;
};

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    text: v('--text-secondary'),
    muted: v('--text-muted'),
    grid: v('--grid'),
    surface: v('--surface'),
    series1: v('--series-1'),
    series1Soft: v('--series-1-soft'),
    series2: v('--series-2'),
    series3: v('--series-3'),
  };
}

/** CSS 変数から色を読み、ライト/ダークの切り替えに追従する */
function useChartColors(): Colors {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColors(readColors());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return colors;
}

/** 折れ線・棒グラフ共通の設定。scales.y は線形軸として扱えるよう型を付ける */
type BaseOptions<T extends 'line' | 'bar'> = ChartOptions<T> & {
  scales: { x: { stacked?: boolean }; y: { stacked?: boolean; beginAtZero?: boolean } };
};

function baseOptions<T extends 'line' | 'bar'>(c: Colors, unit: string): BaseOptions<T> {
  const o: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.surface,
        titleColor: c.text,
        bodyColor: c.text,
        borderColor: c.grid,
        borderWidth: 1,
        padding: 10,
        filter: (item) => item.parsed.y != null,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${(ctx.parsed.y as number | null)?.toFixed(1)} ${unit}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: c.grid },
        ticks: { color: c.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 16 },
      },
      y: {
        grid: { color: c.grid },
        border: { display: false },
        ticks: { color: c.muted, maxTicksLimit: 6, callback: (v) => `${v}` },
        grace: '5%',
      },
    },
  };
  return o as unknown as BaseOptions<T>;
}

function Empty({ text }: { text: string }) {
  return <div className="chart-empty">{text}</div>;
}

export type LegendItem = { label: string; color: string; kind: 'line' | 'dot' | 'dashed' };

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label} className="legend-item">
          <span
            className={`legend-swatch ${i.kind === 'dot' ? 'dot' : i.kind === 'dashed' ? 'dashed' : ''}`}
            style={i.kind === 'dot' ? { background: i.color } : { borderColor: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** 体重：日々の値（点＋細線）と 7 日平均（太線）、目標体重（破線） */
export function WeightChart({ days, height = 260 }: { days: DailyStat[]; height?: number }) {
  const c = useChartColors();
  const hasData = days.some((d) => d.weightKg != null);
  const hasGoal = days.some((d) => d.goalWeightKg != null);

  const data = useMemo(() => {
    const datasets: ChartDataset<'line', (number | null)[]>[] = [
      {
        label: '体重',
        data: days.map((d) => d.weightKg),
        borderColor: c.series1Soft,
        backgroundColor: c.series1Soft,
        borderWidth: 1,
        pointRadius: days.length > 120 ? 0 : 3,
        pointHoverRadius: 5,
        // 数日の記録漏れは線でつなぐが、7日を超える空白はつながない（変化がなかったように見えるため）
        spanGaps: 7,
      },
      {
        label: '7日平均',
        data: days.map((d) => d.weightMa7),
        borderColor: c.series1,
        backgroundColor: c.series1,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false,
        tension: 0.3,
      },
    ];
    if (hasGoal) {
      datasets.push({
        label: '目標体重',
        data: days.map((d) => d.goalWeightKg),
        borderColor: c.muted,
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
      });
    }
    return { labels: days.map((d) => formatShort(d.date)), datasets };
  }, [days, c, hasGoal]);

  const options = useMemo(() => baseOptions<'line'>(c, 'kg'), [c]);

  return (
    <>
      <Legend
        items={[
          { label: '体重（毎日）', color: c.series1Soft, kind: 'dot' },
          { label: '7日平均', color: c.series1, kind: 'line' },
          ...(hasGoal ? [{ label: '目標体重', color: c.muted, kind: 'dashed' as const }] : []),
        ]}
      />
      <div className="chart-box" style={{ height }}>
        {hasData ? (
          <Line data={data} options={options} aria-label="体重の推移グラフ" role="img" />
        ) : (
          <Empty text="この期間の体重の記録はまだありません" />
        )}
      </div>
    </>
  );
}

/** 測定日の点だけを結ぶ 1 系列の折れ線（体脂肪率・除脂肪体重・体脂肪量） */
export function SparseLineChart({
  days,
  pick,
  label,
  unit,
  color,
  emptyText,
  height = 200,
}: {
  days: DailyStat[];
  pick: (d: DailyStat) => number | null;
  label: string;
  unit: string;
  color: 'series1' | 'series2';
  emptyText: string;
  height?: number;
}) {
  const c = useChartColors();
  const points = useMemo(() => days.filter((d) => pick(d) != null), [days, pick]);
  const col = c[color];

  const data = useMemo(
    () => ({
      labels: points.map((d) => formatShort(d.date)),
      datasets: [
        {
          label,
          data: points.map(pick),
          borderColor: col,
          backgroundColor: col,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: c.surface,
          pointBorderWidth: 2,
        },
      ],
    }),
    [points, pick, label, col, c.surface],
  );

  const options = useMemo(() => {
    const o = baseOptions<'line'>(c, unit);
    // 前回測定からの変化をツールチップに出す
    o.plugins!.tooltip!.callbacks = {
      label: (ctx) => {
        const v = ctx.parsed.y ?? 0;
        const prev = ctx.dataIndex > 0 ? pick(points[ctx.dataIndex - 1]!) : null;
        const diff = prev != null ? `（前回比 ${v - prev >= 0 ? '+' : ''}${(v - prev).toFixed(1)}）` : '';
        return ` ${label}: ${v.toFixed(1)} ${unit}${diff}`;
      },
    };
    return o;
  }, [c, unit, label, pick, points]);

  return (
    <div className="chart-box" style={{ height }}>
      {points.length > 0 ? (
        <Line data={data} options={options} aria-label={`${label}の推移グラフ`} role="img" />
      ) : (
        <Empty text={emptyText} />
      )}
    </div>
  );
}

const barBase = {
  maxBarThickness: 18,
  categoryPercentage: 0.8,
  barPercentage: 0.9,
} as const;

/** 摂取カロリー：日別の棒＋目標の線（目標設定時のみ） */
export function KcalChart({ days, height = 260 }: { days: DailyStat[]; height?: number }) {
  const c = useChartColors();
  const hasData = days.some((d) => d.kcal != null);
  const hasGoal = days.some((d) => d.goalKcal != null);

  const data = useMemo(() => {
    const datasets: ChartDataset<'bar' | 'line', (number | null)[]>[] = [
      {
        type: 'bar',
        label: '摂取カロリー',
        data: days.map((d) => d.kcal),
        backgroundColor: c.series1,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        ...barBase,
        order: 2,
      },
    ];
    if (hasGoal) {
      datasets.push({
        type: 'line',
        label: '目標',
        data: days.map((d) => d.goalKcal),
        borderColor: c.muted,
        backgroundColor: c.muted,
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        stepped: 'middle',
        order: 1,
      });
    }
    return { labels: days.map((d) => formatShort(d.date)), datasets } as ChartData<'bar' | 'line', (number | null)[]>;
  }, [days, c, hasGoal]);

  const options = useMemo(() => {
    const o = baseOptions<'bar'>(c, 'kcal');
    o.plugins!.tooltip!.callbacks = {
      label: (ctx) => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y as number).toLocaleString()} kcal`,
    };
    o.scales!.y!.beginAtZero = true;
    return o as ChartOptions<'bar' | 'line'>;
  }, [c]);

  return (
    <>
      {hasGoal && (
        <Legend
          items={[
            { label: '摂取カロリー', color: c.series1, kind: 'dot' },
            { label: '目標', color: c.muted, kind: 'dashed' },
          ]}
        />
      )}
      <div className="chart-box" style={{ height }}>
        {hasData ? (
          <Chart type="bar" data={data} options={options} aria-label="摂取カロリーの推移グラフ" role="img" />
        ) : (
          <Empty text="この期間の食事の記録はまだありません" />
        )}
      </div>
    </>
  );
}

const PFC = [
  { key: 'proteinG', label: 'P（たんぱく質）', short: 'P', factor: 4, color: 'series1' },
  { key: 'fatG', label: 'F（脂質）', short: 'F', factor: 9, color: 'series2' },
  { key: 'carbsG', label: 'C（炭水化物）', short: 'C', factor: 4, color: 'series3' },
] as const;

/** PFC：日別の積み上げ棒（kcal 換算）と、期間平均の表 */
export function PfcChart({ days, height = 260 }: { days: DailyStat[]; height?: number }) {
  const c = useChartColors();
  const withMeals = days.filter((d) => d.kcal != null);

  const data = useMemo(
    () => ({
      labels: days.map((d) => formatShort(d.date)),
      datasets: PFC.map((m, i) => ({
        label: m.short,
        data: days.map((d) => (d[m.key] == null ? null : Math.round(d[m.key]! * m.factor))),
        backgroundColor: c[m.color],
        // 積み上げの区切りに背景色の 2px のすき間を入れる
        borderColor: c.surface,
        borderWidth: i === 0 ? 0 : { top: 0, bottom: 2, left: 0, right: 0 },
        borderSkipped: false as const,
        borderRadius: i === PFC.length - 1 ? { topLeft: 4, topRight: 4 } : 0,
        stack: 'pfc',
        ...barBase,
      })),
    }),
    [days, c],
  );

  const options = useMemo(() => {
    const o = baseOptions<'bar'>(c, 'kcal');
    o.scales!.x!.stacked = true;
    o.scales!.y!.stacked = true;
    o.scales!.y!.beginAtZero = true;
    o.plugins!.tooltip!.callbacks = {
      label: (ctx) => {
        const m = PFC[ctx.datasetIndex]!;
        const g = days[ctx.dataIndex]![m.key] ?? 0;
        const total = days[ctx.dataIndex]!.kcal ?? 0;
        const kcal = ctx.parsed.y as number;
        const pct = total > 0 ? Math.round((kcal / Math.max(total, 1)) * 100) : 0;
        return ` ${m.short}: ${fmtG(g)}g（${kcal}kcal・${pct}%）`;
      },
      footer: (items) => {
        const d = days[items[0]!.dataIndex]!;
        return d.kcal != null ? `合計 ${d.kcal.toLocaleString()} kcal` : '';
      },
    };
    return o;
  }, [c, days]);

  // 期間平均（食事を記録した日のみ）
  const avg = (k: 'proteinG' | 'fatG' | 'carbsG' | 'kcal') =>
    withMeals.length ? withMeals.reduce((s, d) => s + (d[k] ?? 0), 0) / withMeals.length : 0;
  const avgKcal = avg('kcal');
  const pfcKcal = PFC.map((m) => avg(m.key) * m.factor);
  const pfcTotal = pfcKcal.reduce((a, b) => a + b, 0);

  return (
    <>
      <Legend items={PFC.map((m) => ({ label: m.label, color: c[m.color], kind: 'dot' as const }))} />
      <div className="chart-box" style={{ height }}>
        {withMeals.length > 0 ? (
          <Bar data={data} options={options} aria-label="PFC の推移グラフ" role="img" />
        ) : (
          <Empty text="この期間の食事の記録はまだありません" />
        )}
      </div>
      {withMeals.length > 0 && (
        <div className="table-wrap">
          <table className="data pfc-table">
            <caption className="small muted">期間平均（食事を記録した {withMeals.length} 日）</caption>
            <thead>
              <tr>
                <th></th>
                <th>1日平均</th>
                <th>kcal</th>
                <th>比率</th>
              </tr>
            </thead>
            <tbody>
              {PFC.map((m, i) => (
                <tr key={m.key}>
                  <td>
                    <span className="legend-swatch dot" style={{ background: c[m.color], display: 'inline-block', marginRight: 6 }} />
                    {m.label}
                  </td>
                  <td>{Math.round(avg(m.key))} g</td>
                  <td>{Math.round(pfcKcal[i]!).toLocaleString()}</td>
                  <td>{pfcTotal > 0 ? Math.round((pfcKcal[i]! / pfcTotal) * 100) : 0}%</td>
                </tr>
              ))}
              <tr>
                <td>カロリー</td>
                <td>{Math.round(avgKcal).toLocaleString()} kcal</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
