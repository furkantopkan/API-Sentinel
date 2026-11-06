export interface TabItem<TId extends string> {
  id: TId;
  label: string;
  /** Optional counter shown next to the label, e.g. "Params (2)". */
  count?: number;
}

interface TabsProps<TId extends string> {
  tabs: readonly TabItem<TId>[];
  activeId: TId;
  onChange: (id: TId) => void;
  ariaLabel: string;
}

/** Generic tab bar. The parent decides which panel to render for `activeId`. */
export function Tabs<TId extends string>({ tabs, activeId, onChange, ariaLabel }: TabsProps<TId>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
