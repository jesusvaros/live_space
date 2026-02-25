import { PostWithSetlist } from '../../lib/types';

type SecondStackProps = {
  moments: PostWithSetlist[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

const SecondStack: React.FC<SecondStackProps> = ({ moments, selectedIndex, onSelect }) => {
  if (moments.length <= 1) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-2">
      {moments.map((moment, index) => (
        <button
          key={moment.id}
          type="button"
          className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border transition-all hover:opacity-95 ${
            index === selectedIndex ? 'border-app-accent shadow-[0_4px_10px_rgba(255,107,74,0.2)]' : 'border-white/10 bg-white/5'
          }`}
          onClick={() => onSelect(index)}
        >
          {moment.media_type === 'video' ? (
            moment.thumbnail_url ? (
              <img src={moment.thumbnail_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
            ) : (
              <video muted preload="metadata" className="h-full w-full object-cover">
                <source src={moment.media_url} />
              </video>
            )
          ) : (
            <img src={moment.media_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
          )}
          <span className="sr-only">Moment {index + 1}</span>
        </button>
      ))}
    </div>
  );
};

export default SecondStack;
