import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livespace.app',
  appName: 'Live Space',
  webDir: 'dist',
  backgroundColor: '#0b0b0d',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
