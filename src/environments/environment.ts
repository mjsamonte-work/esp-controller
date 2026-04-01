// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  mqtt: {
    host: 'a0d47caf983d432e848a0047897b3ad3.s1.eu.hivemq.cloud',
    port: 8883,
    websocketPort: 8884,
    protocol: 'wss',
    path: '/mqtt',
    username: 'hf5C405x',
    password: '?rkG479!C}rW~98Z',
    publishTopic: 'home/esp1/led/control',
    subscribeTopic: 'home/esp1/led/status',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
