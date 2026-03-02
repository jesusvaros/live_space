import React, { useMemo, useState } from 'react';
import { SuggestedSection } from '../types';

type SuggestedSectionListProps<T> = {
  sections: SuggestedSection<T>[];
  renderItem: (item: T) => React.ReactNode;
};

const SuggestedSectionList = <T,>({ sections, renderItem }: SuggestedSectionListProps<T>) => {
  const [expanded, setExpanded] = useState(false);

  const visibleSections = useMemo(() => {
    if (expanded) return sections;
    return sections.slice(0, 2);
  }, [expanded, sections]);

  const hiddenCount = Math.max(0, sections.length - visibleSections.length);

  return (
    <div className="space-y-6">
      {visibleSections.map(section => (
        <section key={section.key} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">{section.title}</h3>
          </div>
          <div className="space-y-2">
            {section.items.map(renderItem)}
          </div>
        </section>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
      {expanded && sections.length > 2 && (
        <button
          type="button"
          className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      )}
    </div>
  );
};

export default SuggestedSectionList;
