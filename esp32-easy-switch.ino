#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

WebServer server(80);
Preferences wifiPreferences;
Preferences devicePreferences;

/*
|--------------------------------------------------------------------------
| Device Configuration
|--------------------------------------------------------------------------
| Change these values before flashing each device.
*/

const char* DEVICE_ID = "easy-switch-00001";
const char* DEVICE_MODEL = "ESP32-CAM";
const char* DEVICE_TYPE = "EASY_SWITCH";
const char* FIRMWARE_VERSION = "1.0.0";
const char* AP_PASSWORD = "12345678";

const char* MQTT_SERVER = "a0d47caf983d432e848a0047897b3ad3.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USER = "hf5C405x";
const char* MQTT_PASS = "?rkG479!C}rW~98Z";

const unsigned long MQTT_RECONNECT_INTERVAL_MS = 2000;

#define EQUIPMENT_1_PIN 15
#define EQUIPMENT_2_PIN 2
#define EQUIPMENT_3_PIN 0
#define EQUIPMENT_4_PIN 4
#define EQUIPMENT_5_PIN 5

const int WIFI_CONNECT_RETRIES = 20;
const int WIFI_CONNECT_DELAY_MS = 500;

bool isSetupMode = true;
String hostname = String(DEVICE_ID) + ".local";
String topic_command = "devices/" + String(DEVICE_ID) + "/command";
String topic_event = "devices/" + String(DEVICE_ID) + "/event";

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
unsigned long lastMqttReconnectAttempt = 0;

void handleRoot();
void handleDeviceInfo();
void handleScan();
void handleSave();
void handleResetWiFi();
void handleWiFiStatus();
void handleOptions();

String escapeJson(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", "\\n");
  value.replace("\r", "\\r");
  return value;
}

String getJsonValue(const String& body, const String& key) {
  String token = "\"" + key + "\"";
  int keyIndex = body.indexOf(token);

  if (keyIndex < 0) {
    return "";
  }

  int colonIndex = body.indexOf(":", keyIndex + token.length());

  if (colonIndex < 0) {
    return "";
  }

  int startQuote = body.indexOf("\"", colonIndex + 1);

  if (startQuote < 0) {
    return "";
  }

  String value = "";
  bool escaping = false;

  for (int i = startQuote + 1; i < body.length(); i++) {
    char c = body.charAt(i);

    if (escaping) {
      value += c;
      escaping = false;
      continue;
    }

    if (c == '\\') {
      escaping = true;
      continue;
    }

    if (c == '"') {
      return value;
    }

    value += c;
  }

  return "";
}

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

void sendJson(int statusCode, const String& json) {
  sendCorsHeaders();
  server.send(statusCode, "application/json", json);
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

void saveWiFiCredentials(const String& ssid, const String& password) {
  wifiPreferences.begin("wifi", false);
  wifiPreferences.putString("ssid", ssid);
  wifiPreferences.putString("password", password);
  wifiPreferences.end();
}

void clearWiFiCredentials() {
  wifiPreferences.begin("wifi", false);
  wifiPreferences.clear();
  wifiPreferences.end();
}

void keepSetupPortalAvailable() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(DEVICE_ID, AP_PASSWORD);
  isSetupMode = true;
}

bool tryConnectWiFi(const String& ssid, const String& password) {
  keepSetupPortalAvailable();
  WiFi.begin(ssid.c_str(), password.c_str());

  for (int i = 0; i < WIFI_CONNECT_RETRIES; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      return true;
    }

    delay(WIFI_CONNECT_DELAY_MS);
  }

  WiFi.disconnect(false, false);
  keepSetupPortalAvailable();
  return false;
}

/*
|--------------------------------------------------------------------------
| Equipment + MQTT Core
|--------------------------------------------------------------------------
*/

int getEquipmentPin(const char* component) {
  if (strcmp(component, "equipment-1") == 0) return EQUIPMENT_1_PIN;
  if (strcmp(component, "equipment-2") == 0) return EQUIPMENT_2_PIN;
  if (strcmp(component, "equipment-3") == 0) return EQUIPMENT_3_PIN;
  if (strcmp(component, "equipment-4") == 0) return EQUIPMENT_4_PIN;
  if (strcmp(component, "equipment-5") == 0) return EQUIPMENT_5_PIN;
  return -1;
}

const char* getPreferenceKey(const char* component) {
  if (strcmp(component, "equipment-1") == 0) return "eq1";
  if (strcmp(component, "equipment-2") == 0) return "eq2";
  if (strcmp(component, "equipment-3") == 0) return "eq3";
  if (strcmp(component, "equipment-4") == 0) return "eq4";
  if (strcmp(component, "equipment-5") == 0) return "eq5";
  return "unknown";
}

void publishDeviceStatus(const char* state) {
  if (!mqttClient.connected()) {
    return;
  }

  StaticJsonDocument<256> doc;
  doc["target"] = "device";
  doc["state"] = state;
  doc["deviceCode"] = DEVICE_ID;

  String payload;
  serializeJson(doc, payload);

  mqttClient.publish(topic_event.c_str(), payload.c_str(), true);

  Serial.print("Published device: ");
  Serial.println(payload);
}

void publishComponentStatus(const char* component, const char* state) {
  if (!mqttClient.connected()) {
    return;
  }

  StaticJsonDocument<256> doc;
  doc["target"] = "component";
  doc["component"] = component;
  doc["state"] = state;
  doc["deviceCode"] = DEVICE_ID;

  String payload;
  serializeJson(doc, payload);

  mqttClient.publish(topic_event.c_str(), payload.c_str(), true);

  Serial.print("Published component: ");
  Serial.println(payload);
}

const char* getSavedStateText(const char* component) {
  const char* key = getPreferenceKey(component);
  bool savedState = devicePreferences.getBool(key, false);
  return savedState ? "ON" : "OFF";
}

void publishCurrentComponentState(const char* component) {
  publishComponentStatus(component, getSavedStateText(component));
}

void publishAllCurrentStates() {
  publishCurrentComponentState("equipment-1");
  delay(100);
  publishCurrentComponentState("equipment-2");
  delay(100);
  publishCurrentComponentState("equipment-3");
  delay(100);
  publishCurrentComponentState("equipment-4");
  delay(100);
  publishCurrentComponentState("equipment-5");
}

void restorePinState(const char* component, int pin) {
  const char* key = getPreferenceKey(component);
  bool lastState = devicePreferences.getBool(key, false);

  digitalWrite(pin, lastState ? HIGH : LOW);

  Serial.print(component);
  Serial.print(" restored: ");
  Serial.println(lastState ? "ON" : "OFF");
}

void setupEquipmentPins() {
  pinMode(EQUIPMENT_1_PIN, OUTPUT);
  pinMode(EQUIPMENT_2_PIN, OUTPUT);
  pinMode(EQUIPMENT_3_PIN, OUTPUT);
  pinMode(EQUIPMENT_4_PIN, OUTPUT);
  pinMode(EQUIPMENT_5_PIN, OUTPUT);

  restorePinState("equipment-1", EQUIPMENT_1_PIN);
  restorePinState("equipment-2", EQUIPMENT_2_PIN);
  restorePinState("equipment-3", EQUIPMENT_3_PIN);
  restorePinState("equipment-4", EQUIPMENT_4_PIN);
  restorePinState("equipment-5", EQUIPMENT_5_PIN);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.println("\n========== MQTT MESSAGE ==========");
  Serial.print("Topic: ");
  Serial.println(topic);

  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Payload: ");
  Serial.println(message);

  StaticJsonDocument<512> doc;

  if (deserializeJson(doc, payload, length)) {
    Serial.println("JSON Parse Error");
    return;
  }

  const char* target = doc["target"];
  const char* state = doc["state"];

  if (!target || !state) {
    Serial.println("Missing target/state");
    return;
  }

  if (strcmp(target, "device") == 0 && strcmp(state, "HEALTH") == 0) {
    Serial.println("Device health check received");
    publishDeviceStatus("ONLINE");
    publishAllCurrentStates();
    return;
  }

  if (strcmp(target, "component") == 0) {
    const char* component = doc["component"];

    if (!component) {
      Serial.println("Missing component");
      return;
    }

    int pin = getEquipmentPin(component);

    if (pin == -1) {
      Serial.println("Invalid component");
      return;
    }

    const char* key = getPreferenceKey(component);

    if (strcmp(state, "HEALTH") == 0) {
      Serial.print("Component health check: ");
      Serial.println(component);
      publishCurrentComponentState(component);
      return;
    }

    if (strcmp(state, "ON") == 0) {
      digitalWrite(pin, HIGH);
      devicePreferences.putBool(key, true);

      Serial.print(component);
      Serial.print(" ON at GPIO ");
      Serial.println(pin);

      publishComponentStatus(component, "ON");
    } else if (strcmp(state, "OFF") == 0) {
      digitalWrite(pin, LOW);
      devicePreferences.putBool(key, false);

      Serial.print(component);
      Serial.print(" OFF at GPIO ");
      Serial.println(pin);

      publishComponentStatus(component, "OFF");
    } else {
      Serial.println("Invalid state");
    }

    return;
  }

  Serial.println("Unknown target");
}

void setupMQTT() {
  espClient.setInsecure();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

bool connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  Serial.print("Connecting MQTT...");

  String clientId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  if (!mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.print("FAILED rc=");
    Serial.println(mqttClient.state());
    return false;
  }

  Serial.println("CONNECTED");
  mqttClient.subscribe(topic_command.c_str());

  Serial.print("Subscribed: ");
  Serial.println(topic_command);

  publishDeviceStatus("ONLINE");
  publishAllCurrentStates();
  return true;
}

void maintainMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
    return;
  }

  unsigned long now = millis();
  if (now - lastMqttReconnectAttempt < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastMqttReconnectAttempt = now;
  connectMQTT();
}

/*
|--------------------------------------------------------------------------
| Device Info
|--------------------------------------------------------------------------
*/

void handleDeviceInfo() {
  String ipAddress = isSetupMode
    ? WiFi.softAPIP().toString()
    : WiFi.localIP().toString();

  String json = "{";
  json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  json += "\"deviceType\":\"" + String(DEVICE_TYPE) + "\",";
  json += "\"ssid\":\"" + String(DEVICE_ID) + "\",";
  json += "\"model\":\"" + String(DEVICE_MODEL) + "\",";
  json += "\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\",";
  json += "\"setupMode\":" + String(isSetupMode ? "true" : "false") + ",";
  json += "\"hostname\":\"" + escapeJson(hostname) + "\",";
  json += "\"ipAddress\":\"" + ipAddress + "\",";
  json += "\"macAddress\":\"" + WiFi.macAddress() + "\"";
  json += "}";

  sendJson(200, json);
}

/*
|--------------------------------------------------------------------------
| Scan WiFi Networks
|--------------------------------------------------------------------------
*/

void handleScan() {
  if (WiFi.getMode() != WIFI_AP_STA) {
    WiFi.mode(WIFI_AP_STA);
    delay(250);
  }

  WiFi.scanDelete();
  int count = WiFi.scanNetworks(false, true, false, 500);

  if (count < 0) {
    String json = "{";
    json += "\"success\":false,";
    json += "\"message\":\"WiFi scan failed.\",";
    json += "\"code\":" + String(count);
    json += "}";
    sendJson(503, json);
    return;
  }

  String json = "[";
  bool hasNetwork = false;

  for (int i = 0; i < count; i++) {
    String ssid = WiFi.SSID(i);

    if (ssid.length() == 0) {
      continue;
    }

    if (hasNetwork) {
      json += ",";
    }

    json += "{";
    json += "\"ssid\":\"" + escapeJson(ssid) + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI(i));
    json += "}";
    hasNetwork = true;
  }

  json += "]";
  WiFi.scanDelete();
  sendJson(200, json);
}

/*
|--------------------------------------------------------------------------
| Save WiFi Credentials
|--------------------------------------------------------------------------
| This endpoint only saves credentials when ESP32 actually connects.
| If the password is wrong, setup AP stays available and credentials are not saved.
*/

void handleSave() {
  String body = server.arg("plain");
  String ssid = getJsonValue(body, "ssid");
  String password = getJsonValue(body, "password");
  ssid.trim();

  if (ssid.length() == 0) {
    sendJson(
      400,
      "{\"success\":false,\"connected\":false,\"message\":\"SSID is required.\"}"
    );
    return;
  }

  bool connected = tryConnectWiFi(ssid, password);

  if (!connected) {
    String json = "{";
    json += "\"success\":false,";
    json += "\"connected\":false,";
    json += "\"ssid\":\"" + escapeJson(ssid) + "\",";
    json += "\"ipAddress\":\"\",";
    json += "\"message\":\"Unable to connect. Check the WiFi password and try again.\"";
    json += "}";

    sendJson(200, json);
    return;
  }

  saveWiFiCredentials(ssid, password);

  String json = "{";
  json += "\"success\":true,";
  json += "\"connected\":true,";
  json += "\"ssid\":\"" + escapeJson(ssid) + "\",";
  json += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rebooting\":true,";
  json += "\"message\":\"Connected successfully. Rebooting into normal mode.\"";
  json += "}";

  sendJson(200, json);

  delay(1000);
  ESP.restart();
}

/*
|--------------------------------------------------------------------------
| Reset WiFi
|--------------------------------------------------------------------------
*/

void handleResetWiFi() {
  clearWiFiCredentials();

  sendJson(
    200,
    "{\"success\":true,\"message\":\"WiFi settings cleared. Rebooting.\"}"
  );

  delay(1000);
  ESP.restart();
}

/*
|--------------------------------------------------------------------------
| WiFi Status
|--------------------------------------------------------------------------
*/

void handleWiFiStatus() {
  bool connected = WiFi.status() == WL_CONNECTED;

  String json = "{";
  json += "\"connected\":" + String(connected ? "true" : "false") + ",";
  json += "\"ssid\":\"" + escapeJson(WiFi.SSID()) + "\",";
  json += "\"ipAddress\":\"";

  if (connected) {
    json += WiFi.localIP().toString();
  }

  json += "\"";
  json += "}";

  sendJson(200, json);
}

/*
|--------------------------------------------------------------------------
| Web Portal
|--------------------------------------------------------------------------
*/

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESP32 Camera Setup</title>
<style>
body{font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;}
button,input,select{width:100%;padding:12px;margin-top:10px;box-sizing:border-box;}
.card{border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:20px;}
button{cursor:pointer;}
.danger{margin-top:20px;}
</style>
</head>
<body>
<div class="card">
  <h3>Device Information</h3>
  <div id="deviceInfo">Loading...</div>
</div>
<div class="card">
  <h3>WiFi Setup</h3>
  <button onclick="scanWifi()">Scan WiFi Networks</button>
  <select id="ssid"></select>
  <input id="password" type="password" placeholder="WiFi Password">
  <button onclick="saveWifi()">Connect Device</button>
  <button class="danger" onclick="resetWifi()">Reset WiFi</button>
  <p id="status"></p>
</div>
<script>
function loadDeviceInfo(){
  fetch('/device-info')
    .then(response => response.json())
    .then(data => {
      document.getElementById('deviceInfo').innerHTML =
        '<b>Device ID:</b> ' + data.deviceId + '<br>' +
        '<b>Type:</b> ' + data.deviceType + '<br>' +
        '<b>Model:</b> ' + data.model + '<br>' +
        '<b>Firmware:</b> ' + data.firmwareVersion + '<br>' +
        '<b>Hostname:</b> ' + data.hostname + '<br>' +
        '<b>IP:</b> ' + data.ipAddress;
    });
}
function scanWifi(){
  document.getElementById('status').innerHTML = 'Scanning...';
  fetch('/scan')
    .then(response => response.json())
    .then(data => {
      let select = document.getElementById('ssid');
      select.innerHTML = '';
      data.forEach(network => {
        let option = document.createElement('option');
        option.value = network.ssid;
        option.text = network.ssid + ' (' + network.rssi + ' dBm)';
        select.appendChild(option);
      });
      document.getElementById('status').innerHTML = 'Found ' + data.length + ' network(s)';
    });
}
function saveWifi(){
  let ssid = document.getElementById('ssid').value;
  let password = document.getElementById('password').value;
  document.getElementById('status').innerHTML = 'Connecting...';
  fetch('/save', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ssid:ssid,password:password})
  })
    .then(response => response.json())
    .then(data => {
      document.getElementById('status').innerHTML = data.message;
    });
}
function resetWifi(){
  if(!confirm('Reset WiFi settings?')) return;
  fetch('/reset-wifi', {method:'POST'})
    .then(response => response.json())
    .then(data => {
      document.getElementById('status').innerHTML = data.message;
    });
}
window.onload = function(){
  loadDeviceInfo();
  scanWifi();
};
</script>
</body>
</html>
)rawliteral";

  sendCorsHeaders();
  server.send(200, "text/html", html);
}

/*
|--------------------------------------------------------------------------
| Connect Using Saved Credentials
|--------------------------------------------------------------------------
*/

bool connectSavedWiFi() {
  wifiPreferences.begin("wifi", true);
  String ssid = wifiPreferences.getString("ssid", "");
  String password = wifiPreferences.getString("password", "");
  wifiPreferences.end();

  if (ssid.length() == 0) {
    return false;
  }

  Serial.println();
  Serial.println("Connecting to WiFi...");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  for (int i = 0; i < WIFI_CONNECT_RETRIES; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      isSetupMode = false;
      Serial.println();
      Serial.println("Connected");
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());
      return true;
    }

    delay(WIFI_CONNECT_DELAY_MS);
    Serial.print(".");
  }

  WiFi.disconnect(false, false);
  return false;
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

void registerRoutes() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/", HTTP_OPTIONS, handleOptions);

  server.on("/device-info", HTTP_GET, handleDeviceInfo);
  server.on("/device-info", HTTP_OPTIONS, handleOptions);

  server.on("/scan", HTTP_GET, handleScan);
  server.on("/scan", HTTP_OPTIONS, handleOptions);

  server.on("/save", HTTP_POST, handleSave);
  server.on("/save", HTTP_OPTIONS, handleOptions);

  server.on("/wifi", HTTP_POST, handleSave);
  server.on("/wifi", HTTP_OPTIONS, handleOptions);

  server.on("/reset-wifi", HTTP_GET, handleResetWiFi);
  server.on("/reset-wifi", HTTP_POST, handleResetWiFi);
  server.on("/reset-wifi", HTTP_OPTIONS, handleOptions);

  server.on("/wifi-status", HTTP_GET, handleWiFiStatus);
  server.on("/wifi-status", HTTP_OPTIONS, handleOptions);
}

/*
|--------------------------------------------------------------------------
| Setup Portal
|--------------------------------------------------------------------------
*/

void startSetupPortal() {
  keepSetupPortalAvailable();
  registerRoutes();
  server.begin();

  Serial.println();
  Serial.println("================================");
  Serial.println("SETUP MODE");
  Serial.println("================================");
  Serial.print("SSID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Password: ");
  Serial.println(AP_PASSWORD);
  Serial.print("Portal URL: http://");
  Serial.println(WiFi.softAPIP());
}

/*
|--------------------------------------------------------------------------
| Setup
|--------------------------------------------------------------------------
*/

void setup() {
  Serial.begin(115200);
  delay(1000);

  devicePreferences.begin("device", false);
  setupEquipmentPins();
  setupMQTT();

  if (!connectSavedWiFi()) {
    startSetupPortal();
    return;
  }

  registerRoutes();
  server.begin();

  Serial.println();
  Serial.println("DEVICE READY");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Device Info API: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/device-info");

  connectMQTT();
}

/*
|--------------------------------------------------------------------------
| Loop
|--------------------------------------------------------------------------
*/

void loop() {
  server.handleClient();
  maintainMQTT();
}
