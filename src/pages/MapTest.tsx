import React, { useEffect, useRef, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppHeader from '../components/AppHeader';

const MapTest: React.FC = () => {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Log mapInstance changes
  useEffect(() => {
    console.log('[Map] mapInstance changed:', !!mapInstance);
  }, [mapInstance]);

  // Monitor ref changes
  useEffect(() => {
    const checkRef = () => {
      if (mapRef.current) {
        console.log('[Map] mapRef.current is now available:', !!mapRef.current);
        setMapInstance(mapRef.current);
      } else {
        console.log('[Map] mapRef.current is still null');
      }
    };

    // Check immediately
    checkRef();
    
    // Check periodically
    const interval = setInterval(checkRef, 500);
    
    // Stop checking after 5 seconds
    setTimeout(() => clearInterval(interval), 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="p-4">
            <h1 className="text-white mb-4">Map Test</h1>
            <MapContainer
              center={[37.3891, -5.9845]}
              zoom={15}
              style={{ height: '400px', width: '100%' }}
              zoomControl={false}
              ref={mapRef}
              whenReady={() => {
                console.log('[Map] MapContainer whenReady triggered');
              }}
            >
              <div>Simple test</div>
            </MapContainer>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default MapTest;
