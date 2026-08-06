'use client';

export type TabId =
  | 'overview'
  | 'manuscript'
  | 'methods'
  | 'data'
  | 'figures'
  | 'versions'
  | 'issues'
  | 'pull-requests'
  | 'reviews'
  | 'citations';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'manuscript', label: 'Manuscript' },
  { id: 'methods', label: 'Methods & Experiments' },
  { id: 'data', label: 'Data & Code' },
  { id: 'figures', label: 'Figures & Visualization' },
  { id: 'versions', label: 'Versions & Diff' },
  { id: 'issues', label: 'Issues' },
  { id: 'pull-requests', label: 'Pull Requests' },
  { id: 'reviews', label: 'Reviews & Discussions' },
  { id: 'citations', label: 'Citations & Related Work' },
];

export function TabNavigation({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <>
      {/* 桌面端：标签导航 */}
      <nav className="pub-tabs" aria-label="研究对象标签">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`pub-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 移动端：下拉选择 */}
      <select
        className="pub-tabs-mobile"
        value={activeTab}
        onChange={(e) => onTabChange(e.target.value as TabId)}
        aria-label="选择标签"
      >
        {TABS.map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label}
          </option>
        ))}
      </select>
    </>
  );
}

export function ComingSoonTab({ tabName }: { tabName: string }) {
  return (
    <div className="pub-coming-soon">
      <h2>{tabName}</h2>
      <p>This feature is coming soon in Phase 1C.</p>
    </div>
  );
}
