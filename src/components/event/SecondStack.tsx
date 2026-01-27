import { PostWithSetlist } from '../../lib/types';

type SecondStackProps = {
  moments: PostWithSetlist[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

const SecondStack: React.FC<SecondStackProps> = ({ moments, selectedIndex, onSelect }) => {
  if (moments.length <= 1) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
      {moments.map((moment, index) => (
        <button
          key={moment.id}
          type="button"
          className="relative h-14 w-14 flex-shrink-0 overflow-hidden bg-white/5 transition-opacity hover:opacity-90"
          onClick={() => onSelect(index)}
        >
          {index === selectedIndex && <span className="absolute left-2 top-2 h-2 w-2 bg-[#ff6b4a]" />}
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
