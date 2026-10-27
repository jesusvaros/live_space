import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livespace.app',
  appName: 'Live Space',
  webDir: 'dist',
  backgroundColor: '#0d0e12',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
