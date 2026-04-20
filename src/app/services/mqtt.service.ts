import { Injectable, InjectionToken, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { type IClientOptions, type MqttClient, type MqttProtocol } from 'mqtt';

import { environment } from '../../environments/environment';

export type MqttConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'error';

export interface MqttLogEntry {
  direction: 'sent' | 'received' | 'status' | 'error';
  message: string;
  payload?: string;
  timestamp: string;
  topic?: string;
}

export type DeviceHealthState = 'unknown' | 'checking' | 'online' | 'offline';

export type MqttConnectFn = (
  brokerUrl: string | IClientOptions,
  options?: IClientOptions,
) => MqttClient;

declare global {
  interface Window {
    mqtt?: {
      connect?: MqttConnectFn;
    };
  }
}

function resolveConnectFn(): MqttConnectFn | null {
  const connectFn = window.mqtt?.connect;

  if (typeof connectFn === 'function') {
    return connectFn;
  }

  return null;
}

export const MQTT_CONNECT = new InjectionToken<MqttConnectFn | null>(
  'MQTT_CONNECT',
  {
    providedIn: 'root',
    factory: () => resolveConnectFn(),
  },
);

@Injectable({
  providedIn: 'root',
})
export class MqttService implements OnDestroy {
  private readonly deviceCheckTimeoutMs = 5000;
  private readonly mqttConfig = environment.mqtt;
  private readonly websocketProtocol: MqttProtocol = 'wss';
  private readonly connectFn = inject(MQTT_CONNECT);
  private readonly logsSubject = new BehaviorSubject<MqttLogEntry[]>([]);
  private readonly stateSubject = new BehaviorSubject<MqttConnectionState>('disconnected');
  private readonly subscriptionSubject = new BehaviorSubject<boolean>(false);
  private readonly deviceHealthSubject = new BehaviorSubject<DeviceHealthState>('unknown');
  private readonly deviceLastSeenSubject = new BehaviorSubject<string | null>(null);
  private readonly deviceCheckInProgressSubject = new BehaviorSubject<boolean>(false);
  private readonly brokerUrl = `${this.websocketProtocol}://${this.mqttConfig.host}:${this.mqttConfig.websocketPort}${this.mqttConfig.path}`;
  private activeDeviceCode: string | null = null;
  private activeSubscribeTopics: string[] = [];
  private deviceCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingHealthCheck = false;

  readonly brokerHost = this.mqttConfig.host;
  readonly brokerPort = this.mqttConfig.websocketPort;
  readonly logs$ = this.logsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly subscribed$ = this.subscriptionSubject.asObservable();
  readonly deviceHealth$ = this.deviceHealthSubject.asObservable();
  readonly deviceLastSeen$ = this.deviceLastSeenSubject.asObservable();
  readonly deviceCheckInProgress$ = this.deviceCheckInProgressSubject.asObservable();

  private client: MqttClient | null = null;

  constructor() {
    this.client = this.createClient();

    if (this.client) {
      this.bindClientEvents();
    }
  }

  ngOnDestroy(): void {
    this.clearDeviceCheckTimeout();
    this.client?.end(true);
  }

  setActiveDevice(deviceCode: string): void {
    const normalizedCode = deviceCode.trim();

    if (!normalizedCode || normalizedCode === this.activeDeviceCode) {
      return;
    }

    const previousTopics = this.activeSubscribeTopics;
    this.activeDeviceCode = normalizedCode;
    const { statusTopic } = this.resolveTopics(normalizedCode);
    const nextTopics = [statusTopic];
    this.activeSubscribeTopics = nextTopics;
    this.subscriptionSubject.next(false);
    this.deviceHealthSubject.next('unknown');
    this.deviceLastSeenSubject.next(null);
    this.deviceCheckInProgressSubject.next(false);
    this.pendingHealthCheck = false;
    this.clearDeviceCheckTimeout();

    if (!this.client) {
      return;
    }

    if (previousTopics.length > 0) {
      for (const topic of previousTopics) {
        if (!nextTopics.includes(topic)) {
          this.client.unsubscribe?.(topic);
        }
      }
    }

    if (this.stateSubject.value === 'connected' || this.stateSubject.value === 'subscribed') {
      this.subscribeToActiveDevice();
    }
  }

  publishState(deviceCode: string, state: 'ON' | 'OFF'): Promise<void> {
    if (!this.client) {
      this.stateSubject.next('error');
      this.addLog({
        direction: 'error',
        message: `Cannot publish ${state} command`,
        payload: 'MQTT client is unavailable',
        topic: this.resolveTopics(deviceCode).controlTopic,
      });
      return Promise.reject(new Error('MQTT client is unavailable'));
    }

    const normalizedCode = deviceCode.trim();

    if (!normalizedCode) {
      return Promise.reject(new Error('Device code is required.'));
    }

    this.setActiveDevice(normalizedCode);

    const { controlTopic } = this.resolveTopics(normalizedCode);
    const payload = JSON.stringify({
      state,
      timestamp: new Date().toISOString(),
    });

    return new Promise<void>((resolve, reject) => {
      this.client?.publish(controlTopic, payload, { qos: 0 }, (error?: Error) => {
        if (error) {
          this.stateSubject.next('error');
          this.addLog({
            direction: 'error',
            message: `Failed to publish ${state} command`,
            payload: error.message,
            topic: controlTopic,
          });
          reject(error);
          return;
        }

        this.addLog({
          direction: 'sent',
          message: `${state} command sent`,
          payload,
          topic: controlTopic,
        });
        resolve();
      });
    });
  }

  checkDeviceStatus(deviceCode: string): Promise<void> {
    const normalizedCode = deviceCode.trim();

    if (!normalizedCode) {
      return Promise.reject(new Error('Device code is required.'));
    }

    this.setActiveDevice(normalizedCode);
    this.deviceHealthSubject.next('checking');
    this.deviceCheckInProgressSubject.next(true);
    this.pendingHealthCheck = true;
    this.clearDeviceCheckTimeout();

    if (!this.client) {
      this.deviceHealthSubject.next('offline');
      this.deviceCheckInProgressSubject.next(false);
      return Promise.reject(new Error('MQTT client is unavailable'));
    }

    if (this.stateSubject.value !== 'connected' && this.stateSubject.value !== 'subscribed') {
      return Promise.resolve();
    }

    return this.publishDeviceCheck(normalizedCode);
  }

  private createClient(): MqttClient | null {
    if (!this.connectFn) {
      this.stateSubject.next('error');
      this.addLog({
        direction: 'error',
        message: 'MQTT client unavailable',
        payload: 'Browser MQTT script did not load',
      });
      return null;
    }

    this.stateSubject.next('connecting');
    this.addLog({
      direction: 'status',
      message: 'Connecting to MQTT broker',
      payload: this.brokerUrl,
    });

    return this.connectFn(this.brokerUrl, {
      protocol: this.websocketProtocol,
      host: this.mqttConfig.host,
      port: this.mqttConfig.websocketPort,
      path: this.mqttConfig.path,
      clientId: `dc-controller-${Math.random().toString(16).slice(2, 10)}`,
      username: this.mqttConfig.username,
      password: this.mqttConfig.password,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
      protocolVersion: 4,
      resubscribe: true,
    });
  }

  private bindClientEvents(): void {
    const client = this.client;

    if (!client) {
      return;
    }

    client.on('connect', () => {
      this.stateSubject.next('connected');
      this.subscriptionSubject.next(false);
      this.addLog({
        direction: 'status',
        message: 'Connected to MQTT broker',
        payload: this.brokerUrl,
      });

      this.subscribeToActiveDevice();
    });

    client.on('message', (topic, payload) => {
      this.handleIncomingMessage(topic, payload.toString());
      this.addLog({
        direction: 'received',
        message: 'Message received',
        payload: payload.toString(),
        topic,
      });
    });

    client.on('reconnect', () => {
      this.stateSubject.next('connecting');
      this.subscriptionSubject.next(false);
      this.deviceHealthSubject.next('unknown');
      this.deviceCheckInProgressSubject.next(false);
      this.clearDeviceCheckTimeout();
      this.addLog({
        direction: 'status',
        message: 'Reconnecting to MQTT broker',
      });
    });

    client.on('close', () => {
      this.stateSubject.next('disconnected');
      this.subscriptionSubject.next(false);
      this.deviceHealthSubject.next('unknown');
      this.deviceCheckInProgressSubject.next(false);
      this.clearDeviceCheckTimeout();
      this.addLog({
        direction: 'status',
        message: 'Disconnected from MQTT broker',
      });
    });

    client.on('error', (error) => {
      this.stateSubject.next('error');
      this.subscriptionSubject.next(false);
      this.deviceHealthSubject.next('unknown');
      this.deviceCheckInProgressSubject.next(false);
      this.clearDeviceCheckTimeout();
      this.addLog({
        direction: 'error',
        message: 'MQTT client error',
        payload: error.message,
      });
    });
  }

  private addLog(entry: Omit<MqttLogEntry, 'timestamp'>): void {
    this.logsSubject.next([
      {
        ...entry,
        timestamp: new Date().toISOString(),
      },
      ...this.logsSubject.value,
    ]);
  }

  private subscribeToActiveDevice(): void {
    const client = this.client;

    if (!client || !this.activeDeviceCode) {
      return;
    }

    const activeDeviceCode = this.activeDeviceCode;
    const { statusTopic } = this.resolveTopics(activeDeviceCode);
    const subscribeTopics = [statusTopic];

    client.subscribe(subscribeTopics, { qos: 0 }, (error?: Error | null) => {
      if (error) {
        this.stateSubject.next('error');
        this.subscriptionSubject.next(false);
        this.addLog({
          direction: 'error',
          message: 'Failed to subscribe to device topics',
          payload: error.message,
          topic: subscribeTopics.join(', '),
        });
        return;
      }

      this.activeSubscribeTopics = subscribeTopics;
      this.stateSubject.next('subscribed');
      this.subscriptionSubject.next(true);
      this.addLog({
        direction: 'status',
        message: 'Subscribed to device topics',
        topic: subscribeTopics.join(', '),
      });

      if (this.pendingHealthCheck) {
        void this.publishDeviceCheck(activeDeviceCode);
      }
    });
  }

  private publishDeviceCheck(deviceCode: string): Promise<void> {
    const client = this.client;

    if (!client) {
      this.deviceHealthSubject.next('offline');
      this.deviceCheckInProgressSubject.next(false);
      return Promise.reject(new Error('MQTT client is unavailable'));
    }

    const { controlTopic } = this.resolveTopics(deviceCode);
    const payload = JSON.stringify({
      state: 'HEALTH',
      timestamp: new Date().toISOString(),
    });

    return new Promise<void>((resolve, reject) => {
      client.publish(controlTopic, payload, { qos: 0 }, (error?: Error) => {
        if (error) {
          this.deviceHealthSubject.next('offline');
          this.deviceCheckInProgressSubject.next(false);
          this.pendingHealthCheck = false;
          this.addLog({
            direction: 'error',
            message: 'Failed to request device status',
            payload: error.message,
            topic: controlTopic,
          });
          reject(error);
          return;
        }

        this.pendingHealthCheck = false;
        this.armDeviceCheckTimeout(deviceCode);
        this.addLog({
          direction: 'sent',
          message: 'Requested device status',
          payload,
          topic: controlTopic,
        });
        resolve();
      });
    });
  }

  private armDeviceCheckTimeout(deviceCode: string): void {
    this.clearDeviceCheckTimeout();

    this.deviceCheckTimeoutId = setTimeout(() => {
      if (this.activeDeviceCode !== deviceCode) {
        return;
      }

      this.deviceHealthSubject.next('offline');
      this.deviceCheckInProgressSubject.next(false);
      this.pendingHealthCheck = false;
      this.addLog({
        direction: 'status',
        message: 'Device status check timed out',
        topic: this.resolveTopics(deviceCode).statusTopic,
      });
    }, this.deviceCheckTimeoutMs);
  }

  private clearDeviceCheckTimeout(): void {
    if (this.deviceCheckTimeoutId) {
      clearTimeout(this.deviceCheckTimeoutId);
      this.deviceCheckTimeoutId = null;
    }
  }

  private handleIncomingMessage(topic: string, _payload: string): void {
    if (!this.activeDeviceCode) {
      return;
    }

    const { statusTopic } = this.resolveTopics(this.activeDeviceCode);

    if (topic !== statusTopic) {
      return;
    }

    this.clearDeviceCheckTimeout();
    this.pendingHealthCheck = false;
    this.deviceHealthSubject.next('online');
    this.deviceCheckInProgressSubject.next(false);
    this.deviceLastSeenSubject.next(new Date().toISOString());
  }

  private resolveTopics(
    deviceCode: string,
  ): {
    controlTopic: string;
    statusTopic: string;
  } {
    const normalizedCode = deviceCode.trim();

    return {
      controlTopic: `home/${normalizedCode}/led/control`,
      statusTopic: `home/${normalizedCode}/led/status`,
    };
  }
}
