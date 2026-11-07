import {
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { formatShort } from '../../shared/date';
import type { DailyStat } from '../../shared/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

type Colors = {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  series1: string;
  series1Soft: string;
  series2: string;
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

function baseOptions(c: Colors, unit: string): ChartOptions<'line'> {
  return {
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
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} ${unit}`,
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

  const options = useMemo(() => baseOptions(c, 'kg'), [c]);

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
    const o = baseOptions(c, unit);
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
