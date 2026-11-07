import { NavLink, Navigate, Route, Routes } from 'react-router';
import { today } from '../shared/date';
import { ChartsPage } from './pages/ChartsPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { RecordPage } from './pages/RecordPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/record', label: '記録', icon: '✏️', end: false },
  { to: '/charts', label: 'グラフ', icon: '📈', end: false },
  { to: '/history', label: '履歴', icon: '📅', end: false },
  { to: '/foods', label: 'マイ食品', icon: '🍙', end: false, soon: true },
  { to: '/settings', label: '目標・設定', icon: '⚙️', end: false },
];

function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="stack">
      <h1>{title}</h1>
      <div className="card muted">フェーズ{phase}で追加します。</div>
    </div>
  );
}

export function App() {
  return (
    <div className="layout">
      <nav className="sidenav" aria-label="メニュー">
        <div className="brand">💪 Power</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span aria-hidden>{n.icon}</span>
            {n.label}
            {n.soon && <span className="soon">準備中</span>}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/record" element={<Navigate to={`/record/${today()}`} replace />} />
          <Route path="/record/:date" element={<RecordPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/foods" element={<ComingSoon title="マイ食品" phase={3} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
