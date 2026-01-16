import React from 'react';

const FeedList: React.FC = () => {
  // Mock data for now
  const posts = [
    { id: 1, title: 'Summer Music Festival', user: 'John Doe', location: 'Barcelona', date: '2024-07-15' },
    { id: 2, title: 'Jazz Night at Blue Note', user: 'Jane Smith', location: 'Madrid', date: '2024-07-14' },
    { id: 3, title: 'Rock Concert', user: 'Mike Johnson', location: 'Valencia', date: '2024-07-13' },
    { id: 4, title: 'Electronic Music Festival', user: 'Sarah Wilson', location: 'Bilbao', date: '2024-07-12' },
  ];

  return (
    <div>
      {posts.map(post => (
        <div key={post.id} className="app-card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-800">
              <img src={`https://picsum.photos/seed/${post.user}/40/40`} alt="avatar" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">{post.user}</h2>
              <p className="text-xs text-slate-500">
                {post.location} • {post.date}
              </p>
            </div>
          </div>
          <img src={`https://picsum.photos/seed/${post.id}/300/200`} alt="event" className="rounded-2xl" />
          <h3 className="font-display text-lg text-slate-50">{post.title}</h3>
        </div>
      ))}
    </div>
  );
};

export default FeedList;
