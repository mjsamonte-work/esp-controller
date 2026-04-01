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
  private readonly mqttConfig = environment.mqtt;
  private readonly websocketProtocol: MqttProtocol = 'wss';
  private readonly connectFn = inject(MQTT_CONNECT);
  private readonly logsSubject = new BehaviorSubject<MqttLogEntry[]>([]);
  private readonly stateSubject = new BehaviorSubject<MqttConnectionState>('disconnected');
  private readonly subscriptionSubject = new BehaviorSubject<boolean>(false);
  private readonly brokerUrl = `${this.websocketProtocol}://${this.mqttConfig.host}:${this.mqttConfig.websocketPort}${this.mqttConfig.path}`;

  readonly brokerHost = this.mqttConfig.host;
  readonly publishTopic = this.mqttConfig.publishTopic;
  readonly subscribeTopic = this.mqttConfig.subscribeTopic;
  readonly brokerPort = this.mqttConfig.websocketPort;
  readonly logs$ = this.logsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly subscribed$ = this.subscriptionSubject.asObservable();

  private client: MqttClient | null = null;

  constructor() {
    this.client = this.createClient();

    if (this.client) {
      this.bindClientEvents();
    }
  }

  ngOnDestroy(): void {
    this.client?.end(true);
  }

  publishState(state: 'ON' | 'OFF'): void {
    if (!this.client) {
      this.stateSubject.next('error');
      this.addLog({
        direction: 'error',
        message: `Cannot publish ${state} command`,
        payload: 'MQTT client is unavailable',
        topic: this.publishTopic,
      });
      return;
    }

    const payload = JSON.stringify({ state });

    this.client.publish(this.publishTopic, payload, { qos: 0 }, (error?: Error) => {
      if (error) {
        this.stateSubject.next('error');
        this.addLog({
          direction: 'error',
          message: `Failed to publish ${state} command`,
          payload: error.message,
          topic: this.publishTopic,
        });
        return;
      }

      this.addLog({
        direction: 'sent',
        message: `${state} command sent`,
        payload,
        topic: this.publishTopic,
      });
    });
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

      client.subscribe(this.subscribeTopic, { qos: 0 }, (error?: Error | null) => {
        if (error) {
          this.stateSubject.next('error');
          this.subscriptionSubject.next(false);
          this.addLog({
            direction: 'error',
            message: 'Failed to subscribe to status topic',
            payload: error.message,
            topic: this.subscribeTopic,
          });
          return;
        }

        this.stateSubject.next('subscribed');
        this.subscriptionSubject.next(true);
        this.addLog({
          direction: 'status',
          message: 'Subscribed to status topic',
          topic: this.subscribeTopic,
        });
      });
    });

    client.on('message', (topic, payload) => {
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
      this.addLog({
        direction: 'status',
        message: 'Reconnecting to MQTT broker',
      });
    });

    client.on('close', () => {
      this.stateSubject.next('disconnected');
      this.subscriptionSubject.next(false);
      this.addLog({
        direction: 'status',
        message: 'Disconnected from MQTT broker',
      });
    });

    client.on('error', (error) => {
      this.stateSubject.next('error');
      this.subscriptionSubject.next(false);
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
}
