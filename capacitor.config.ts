import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livespace.app',
  appName: 'Live Space',
  webDir: 'dist',
  backgroundColor: '#0d0e12',
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    // Native Google / Apple sign-in (src/auth/nativeSocialLogin.ts). Only the
    // providers we use are bundled.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false
      },
      logLevel: 1
    },
    // Push (src/features/notifications). With the app open the system shows
    // nothing and the app puts up a toast instead. Background look on
    // Android: icon, colour and default channel in AndroidManifest.xml.
    PushNotifications: {
      presentationOptions: []
    },
    // Local notifications (new concerts, «¿Subes lo de anoche?») share the
    // push look: monochrome brand mark tinted with the accent.
    LocalNotifications: {
      smallIcon: 'ic_stat_live_space',
      iconColor: '#ff5b2e'
    }
  }
};

export default config;
