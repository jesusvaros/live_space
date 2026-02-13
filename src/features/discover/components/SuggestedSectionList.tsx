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
    <div className="space-y-8">
      {visibleSections.map(section => (
        <section key={section.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">{section.title}</h3>
          </div>
          <div className="space-y-2">
            {section.items.map(renderItem)}
          </div>
        </section>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
      {expanded && sections.length > 2 && (
        <button
          type="button"
          className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      )}
    </div>
  );
};

export default SuggestedSectionList;
