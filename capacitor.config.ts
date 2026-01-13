import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livespace.app',
  appName: 'Live Space',
  webDir: '.next',
  server: {
    androidScheme: 'https',
    url: 'http://localhost:3000',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
