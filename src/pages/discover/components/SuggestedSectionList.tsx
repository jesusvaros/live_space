import React from 'react';
import { SuggestedSection } from '../types';

type SuggestedSectionListProps<T> = {
  sections: SuggestedSection<T>[];
  renderItem: (item: T) => React.ReactNode;
};

const SuggestedSectionList = <T,>({ sections, renderItem }: SuggestedSectionListProps<T>) => {
  return (
    <div className="space-y-6">
      {sections.map(section => (
        <section key={section.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-200">{section.title}</h3>
          </div>
          <div className="space-y-3">
            {section.items.map(renderItem)}
          </div>
        </section>
      ))}
    </div>
  );
};

export default SuggestedSectionList;

