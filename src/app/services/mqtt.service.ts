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
export type EquipmentState = 'unknown' | 'ON' | 'OFF';

interface DeviceStatusMessage {
  target?: string;
  component?: string;
  deviceCode?: string;
  state?: string;
  timestamp?: string;
}

interface MqttMessagePacket {
  retain?: boolean;
}

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
  private readonly statusMessageFreshnessMs = 15000;
  private readonly sharedEventTopic = 'devices/smart-easy-ph-device/event';
  private readonly mqttConfig = environment.mqtt;
  private readonly websocketProtocol: MqttProtocol = 'wss';
  private readonly connectFn = inject(MQTT_CONNECT);
  private readonly logsSubject = new BehaviorSubject<MqttLogEntry[]>([]);
  private readonly stateSubject = new BehaviorSubject<MqttConnectionState>('disconnected');
  private readonly subscriptionSubject = new BehaviorSubject<boolean>(false);
  private readonly deviceHealthSubject = new BehaviorSubject<DeviceHealthState>('unknown');
  private readonly equipmentStateSubject = new BehaviorSubject<EquipmentState>('unknown');
  private readonly deviceLastSeenSubject = new BehaviorSubject<string | null>(null);
  private readonly deviceCheckInProgressSubject = new BehaviorSubject<boolean>(false);
  private readonly brokerUrl = `${this.websocketProtocol}://${this.mqttConfig.host}:${this.mqttConfig.websocketPort}${this.mqttConfig.path}`;
  private activeDeviceCode: string | null = null;
  private activeSubscribeTopics: string[] = [];
  private deviceCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingHealthCheck = false;
  private lastDeviceCheckRequestedAt: number | null = null;

  readonly brokerHost = this.mqttConfig.host;
  readonly brokerPort = this.mqttConfig.websocketPort;
  readonly logs$ = this.logsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly subscribed$ = this.subscriptionSubject.asObservable();
  readonly deviceHealth$ = this.deviceHealthSubject.asObservable();
  readonly equipmentState$ = this.equipmentStateSubject.asObservable();
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
    const { eventTopic } = this.resolveTopics(normalizedCode);
    const nextTopics = [eventTopic, this.sharedEventTopic];
    this.activeSubscribeTopics = nextTopics;
    this.subscriptionSubject.next(false);
    this.deviceHealthSubject.next('unknown');
    this.equipmentStateSubject.next('unknown');
    this.deviceLastSeenSubject.next(null);
    this.deviceCheckInProgressSubject.next(false);
    this.pendingHealthCheck = false;
    this.lastDeviceCheckRequestedAt = null;
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
        topic: this.resolveTopics(deviceCode).commandTopic,
      });
      return Promise.reject(new Error('MQTT client is unavailable'));
    }

    const normalizedCode = deviceCode.trim();

    if (!normalizedCode) {
      return Promise.reject(new Error('Device code is required.'));
    }

    this.setActiveDevice(normalizedCode);

    const { commandTopic } = this.resolveTopics(normalizedCode);
    const payload = JSON.stringify({
      target: 'device',
      state,
      timestamp: new Date().toISOString(),
    });
    this.logOutgoingPublish(`Publishing ${state} command`, commandTopic, payload);

    return new Promise<void>((resolve, reject) => {
      this.client?.publish(commandTopic, payload, { qos: 0 }, (error?: Error) => {
        if (error) {
          this.stateSubject.next('error');
          this.addLog({
            direction: 'error',
            message: `Failed to publish ${state} command`,
            payload: error.message,
            topic: commandTopic,
          });
          reject(error);
          return;
        }

        this.addLog({
          direction: 'sent',
          message: `${state} command sent`,
          payload,
          topic: commandTopic,
        });
        resolve();
      });
    });
  }

  publishComponentState(
    deviceCode: string,
    componentCode: string,
    state: 'ON' | 'OFF',
  ): Promise<void> {
    if (!this.client) {
      this.stateSubject.next('error');
      this.addLog({
        direction: 'error',
        message: `Cannot publish ${state} command for component`,
        payload: 'MQTT client is unavailable',
        topic: this.resolveTopics(deviceCode).commandTopic,
      });
      return Promise.reject(new Error('MQTT client is unavailable'));
    }

    const normalizedDeviceCode = deviceCode.trim();
    const normalizedComponentCode = componentCode.trim();

    if (!normalizedDeviceCode) {
      return Promise.reject(new Error('Device code is required.'));
    }

    if (!normalizedComponentCode) {
      return Promise.reject(new Error('Component code is required.'));
    }

    this.setActiveDevice(normalizedDeviceCode);

    const { commandTopic } = this.resolveTopics(normalizedDeviceCode);
    const payload = JSON.stringify({
      target: 'component',
      state,
      component: normalizedComponentCode,
      timestamp: new Date().toISOString(),
    });
    this.logOutgoingPublish(
      `Publishing ${state} command for component`,
      commandTopic,
      payload,
    );

    return new Promise<void>((resolve, reject) => {
      this.client?.publish(commandTopic, payload, { qos: 0 }, (error?: Error) => {
        if (error) {
          this.stateSubject.next('error');
          this.addLog({
            direction: 'error',
            message: `Failed to publish ${state} command for component`,
            payload: error.message,
            topic: commandTopic,
          });
          reject(error);
          return;
        }

        this.addLog({
          direction: 'sent',
          message: `${state} command sent for component`,
          payload,
          topic: commandTopic,
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
    this.lastDeviceCheckRequestedAt = null;
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

    client.on('message', (topic, payload, packet) => {
      this.handleIncomingMessage(topic, payload.toString(), packet);
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
    const timestamp = new Date().toISOString();
    const logEntry: MqttLogEntry = {
      ...entry,
      timestamp,
    };

    console.log(
      `[MQTT][${logEntry.direction}] ${logEntry.message}`,
      {
        topic: logEntry.topic,
        payload: logEntry.payload,
        timestamp: logEntry.timestamp,
      },
    );

    this.logsSubject.next([
      logEntry,
      ...this.logsSubject.value,
    ]);
  }

  private logOutgoingPublish(message: string, topic: string, payload: string): void {
    this.addLog({
      direction: 'status',
      message,
      payload,
      topic,
    });
  }

  private subscribeToActiveDevice(): void {
    const client = this.client;

    if (!client || !this.activeDeviceCode) {
      return;
    }

    const activeDeviceCode = this.activeDeviceCode;
    const { eventTopic } = this.resolveTopics(activeDeviceCode);
    const subscribeTopics = [eventTopic, this.sharedEventTopic];

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

    const { commandTopic } = this.resolveTopics(deviceCode);
    const requestTimestamp = new Date().toISOString();
    const payload = JSON.stringify({
      target: 'device',
      state: 'HEALTH',
      timestamp: requestTimestamp,
    });
    this.logOutgoingPublish('Requesting device status', commandTopic, payload);

    return new Promise<void>((resolve, reject) => {
      client.publish(commandTopic, payload, { qos: 0 }, (error?: Error) => {
        if (error) {
          this.deviceHealthSubject.next('offline');
          this.deviceCheckInProgressSubject.next(false);
          this.pendingHealthCheck = false;
          this.addLog({
            direction: 'error',
            message: 'Failed to request device status',
            payload: error.message,
            topic: commandTopic,
          });
          reject(error);
          return;
        }

        this.pendingHealthCheck = false;
        this.lastDeviceCheckRequestedAt = Date.parse(requestTimestamp);
        this.armDeviceCheckTimeout(deviceCode);
        this.addLog({
          direction: 'sent',
          message: 'Requested device status',
          payload,
          topic: commandTopic,
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
      this.lastDeviceCheckRequestedAt = null;
      this.addLog({
        direction: 'status',
        message: 'Device status check timed out',
        topic: this.resolveTopics(deviceCode).eventTopic,
      });
    }, this.deviceCheckTimeoutMs);
  }

  private clearDeviceCheckTimeout(): void {
    if (this.deviceCheckTimeoutId) {
      clearTimeout(this.deviceCheckTimeoutId);
      this.deviceCheckTimeoutId = null;
    }
  }

  private handleIncomingMessage(topic: string, payload: string, packet?: MqttMessagePacket): void {
    if (!this.activeDeviceCode) {
      return;
    }

    const { eventTopic } = this.resolveTopics(this.activeDeviceCode);

    if (topic !== eventTopic && topic !== this.sharedEventTopic) {
      return;
    }

    const parsedMessage = this.parseDeviceStatusMessage(payload);

    if (!parsedMessage || !this.isFreshDeviceStatus(parsedMessage)) {
      return;
    }

    if (
      packet?.retain &&
      parsedMessage.target?.trim().toLowerCase() === 'device' &&
      parsedMessage.state?.trim().toUpperCase() === 'ONLINE' &&
      !parsedMessage.timestamp
    ) {
      return;
    }

    this.clearDeviceCheckTimeout();
    this.pendingHealthCheck = false;
    this.lastDeviceCheckRequestedAt = null;
    this.deviceHealthSubject.next('online');
    const normalizedState = parsedMessage.state?.trim().toUpperCase();

    if (normalizedState === 'ON' || normalizedState === 'OFF') {
      this.equipmentStateSubject.next(normalizedState);
    }

    this.deviceCheckInProgressSubject.next(false);
    this.deviceLastSeenSubject.next(parsedMessage.timestamp ?? new Date().toISOString());
  }

  private parseDeviceStatusMessage(payload: string): DeviceStatusMessage | null {
    try {
      const parsed = JSON.parse(payload) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const message = parsed as DeviceStatusMessage;

      return {
        target: typeof message.target === 'string' ? message.target : undefined,
        component: typeof message.component === 'string' ? message.component : undefined,
        deviceCode: typeof message.deviceCode === 'string' ? message.deviceCode : undefined,
        state: typeof message.state === 'string' ? message.state : undefined,
        timestamp: typeof message.timestamp === 'string' ? message.timestamp : undefined,
      };
    } catch {
      return null;
    }
  }

  private isFreshDeviceStatus(message: DeviceStatusMessage): boolean {
    const normalizedState = message.state?.trim().toUpperCase();
    const normalizedTarget = message.target?.trim().toLowerCase();

    if (!normalizedState || !['ONLINE', 'ON', 'OFF'].includes(normalizedState)) {
      return false;
    }

    if (normalizedTarget === 'component' && (normalizedState === 'ON' || normalizedState === 'OFF')) {
      return true;
    }

    if (!message.timestamp) {
      // Allow a plain ONLINE reply only while we are actively waiting for a health-check response.
      return normalizedState === 'ONLINE' && this.lastDeviceCheckRequestedAt !== null;
    }

    const messageTimestamp = Date.parse(message.timestamp);

    if (Number.isNaN(messageTimestamp)) {
      return false;
    }

    const now = Date.now();

    if (Math.abs(now - messageTimestamp) > this.statusMessageFreshnessMs) {
      return false;
    }

    if (this.lastDeviceCheckRequestedAt && messageTimestamp + 1000 < this.lastDeviceCheckRequestedAt) {
      return false;
    }

    return true;
  }

  private resolveTopics(
    deviceCode: string,
  ): {
    commandTopic: string;
    eventTopic: string;
  } {
    const normalizedCode = deviceCode.trim();

    return {
      commandTopic: `devices/${normalizedCode}/command`,
      eventTopic: `devices/${normalizedCode}/event`,
    };
  }
}
