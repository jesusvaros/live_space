import React from 'react';
import { 
  IonCard, 
  IonCardContent, 
  IonCardHeader, 
  IonCardTitle, 
  IonItem, 
  IonAvatar, 
  IonLabel,
  IonImg
} from '@ionic/react';

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
        <IonCard key={post.id}>
          <IonCardHeader>
            <IonItem>
              <IonAvatar slot="start">
                <IonImg src={`https://picsum.photos/seed/${post.user}/40/40`} alt="avatar" />
              </IonAvatar>
              <IonLabel>
                <h2>{post.user}</h2>
                <p>{post.location} • {post.date}</p>
              </IonLabel>
            </IonItem>
          </IonCardHeader>
          <IonCardContent>
            <IonImg src={`https://picsum.photos/seed/${post.id}/300/200`} alt="event" />
            <IonCardTitle>{post.title}</IonCardTitle>
          </IonCardContent>
        </IonCard>
      ))}
    </div>
  );
};

export default FeedList;
