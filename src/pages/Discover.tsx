import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import DiscoverScreen from './discover/DiscoverScreen';

const Discover: React.FC = () => {
  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <DiscoverScreen />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Discover;

