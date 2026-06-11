import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dccontroller.app',
  appName: 'Easy Remote',
  webDir: 'www',
  android: {
    allowMixedContent: true,
  },
  server: {
    cleartext: true,
  },
};

export default config;
