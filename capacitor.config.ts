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
    }
  }
};

export default config;
