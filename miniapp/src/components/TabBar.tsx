import './TabBar.css';

export type Tab = 'videos' | 'watched' | 'subscriptions';

interface TabBarProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'videos', label: 'Видео' },
  { key: 'watched', label: 'Просмотрено' },
  { key: 'subscriptions', label: 'Подписки' },
];

export function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          className={`tab-bar__item${key === activeTab ? ' tab-bar__item--active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
