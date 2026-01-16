import React, { useState } from 'react';
import { 
  IonPage, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonLoading,
  IonAlert
} from '@ionic/react';
import { useHistory } from 'react-router-dom';

const Welcome: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAlert, setShowAlert] = useState(false);
  
  const history = useHistory();

  const handleAuth = async () => {
    setLoading(true);
    setError('');

    try {
      // Mock authentication for now
      if (email && password) {
        // Simulate successful auth
        setTimeout(() => {
          history.replace('/feed');
        }, 1000);
      } else {
        setError('Please fill in all fields');
        setShowAlert(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setShowAlert(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Live Space</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <div className="ion-text-center ion-margin-top">
          <h1>🎵 Live Space</h1>
          <p>Share your local music moments</p>
        </div>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>{isSignUp ? 'Create Account' : 'Sign In'}</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {isSignUp && (
              <IonItem>
                <IonLabel position="stacked">Username</IonLabel>
                <IonInput
                  value={username}
                  onIonChange={e => setUsername(e.detail.value!)}
                  placeholder="Choose a username"
                />
              </IonItem>
            )}
            
            <IonItem>
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput
                type="email"
                value={email}
                onIonChange={e => setEmail(e.detail.value!)}
                placeholder="your@email.com"
              />
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput
                type="password"
                value={password}
                onIonChange={e => setPassword(e.detail.value!)}
                placeholder="••••••••"
              />
            </IonItem>

            <IonButton 
              expand="block" 
              onClick={handleAuth}
              disabled={loading || !email || !password || (isSignUp && !username)}
              className="ion-margin-top"
            >
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </IonButton>

            <IonButton 
              fill="clear" 
              expand="block"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </IonButton>
          </IonCardContent>
        </IonCard>

        <IonLoading isOpen={loading} message="Please wait..." />
        
        <IonAlert
          isOpen={showAlert}
          onDidDismiss={() => setShowAlert(false)}
          header="Error"
          message={error}
          buttons={['OK']}
        />
      </IonContent>
    </IonPage>
  );
};

export default Welcome;
