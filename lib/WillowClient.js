"use strict";

const { parseEmergencyReasons } = require("./emergencyStop");

const API_PORT = 8080;
const RTSP_PORT = 554;
const DEFAULT_TIMEOUT = 10000;

class WillowError extends Error {
  /**
   * @param {string} message
   * @param {"offline"|"not_found"|"http"} code
   */
  constructor(message, code) {
    super(message);
    this.name = "WillowError";
    this.code = code;
  }
}

/**
 * Thin HTTP client for the Willow (Toadi) robot API, see docs/eOAS.yaml.
 *
 * Uses the documented `/api/...` endpoints. A handful of endpoints that the
 * robot serves but that are not (yet) in the spec are marked "undocumented".
 */
class WillowClient {
  constructor(address) {
    this.address = address;
  }

  get baseUrl() {
    return `http://${this.address}:${API_PORT}`;
  }

  get rtspUrl() {
    return `rtsp://${this.address}:${RTSP_PORT}/eyes`;
  }

  get snapshotUrl() {
    // undocumented
    return `${this.baseUrl}/image/front/img.jpg`;
  }

  async request(method, path, { query, timeout = DEFAULT_TIMEOUT } = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }

    let res;
    try {
      res = await fetch(url, { method, signal: AbortSignal.timeout(timeout) });
    } catch (err) {
      throw new WillowError(`${method} ${path}: ${err.message}`, "offline");
    }

    if (res.status === 404) {
      throw new WillowError(`${method} ${path}: 404`, "not_found");
    }
    if (!res.ok) {
      throw new WillowError(`${method} ${path}: HTTP ${res.status}`, "http");
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  get(path, options) {
    return this.request("GET", path, options);
  }

  put(path, options) {
    return this.request("PUT", path, options);
  }

  // Status

  getVersion(options) {
    return this.get("/api/system/version", options);
  }

  getHardwareInfo() {
    return this.get("/api/system/hardwareInfo");
  }

  getActivities() {
    return this.get("/api/activities/info");
  }

  getBatteryStatus() {
    return this.get("/api/system/batteryStatus");
  }

  getDockingInfo() {
    return this.get("/api/system/dockingInfo");
  }

  /** Resolves to the active emergency stop reasons, an empty array when there is none. */
  async getEmergencyStopReasons() {
    const state = await this.get("/api/system/emergencyStop");
    return parseEmergencyReasons(state?.description);
  }

  getMowerInfo() {
    return this.get("/api/system/mowerInfo");
  }

  getMowingInfo() {
    return this.get("/api/system/mowingInfo");
  }

  getOdometry() {
    return this.get("/api/slam/odometry");
  }

  /** Resolves to the distance in meters, or null when nobody was seen in the last 10 seconds. */
  async getPersonDistance() {
    try {
      const info = await this.get("/api/slam/distanceToObject/person");
      return typeof info?.distance === "number" ? info.distance : null;
    } catch (err) {
      if (err.code === "not_found") return null;
      throw err;
    }
  }

  // undocumented
  getRainSensor() {
    return this.get("/statuslog/sensors/rain");
  }

  // undocumented
  getPowerSensor() {
    return this.get("/statuslog/sensors/power");
  }

  // undocumented
  getBaseboardSensors() {
    return this.get("/system/sensors/baseboard");
  }

  // undocumented
  getModuleSensors() {
    return this.get("/system/sensors/module");
  }

  // Commands

  startMowing() {
    return this.put("/api/navigation/startmowing");
  }

  stopMowing() {
    return this.put("/api/navigation/stopmowing");
  }

  async dock() {
    await this.stopMowing();
    return this.put("/api/navigation/startdocking");
  }

  resumeSchedule() {
    return this.put("/api/toolplanner/resume");
  }

  activateEmergencyStop() {
    return this.put("/api/navigation/hardEmergencyStop");
  }

  releaseEmergencyStop() {
    return this.put("/api/navigation/releaseEmergencyStop");
  }

  clearRainSensor() {
    return this.put("/api/maintenance/clearRainSensor");
  }

  reboot() {
    return this.put("/api/maintenance/reboot");
  }

  showEmotion(emotionName) {
    return this.put("/api/maintenance/showEmotion", { query: { emotionName } });
  }

  // undocumented
  playSound(volume = 60) {
    return this.get("/maintenance/sound/play", {
      query: { fileName: "R2D2.wav", volume },
    });
  }

  // undocumented
  stopSound() {
    return this.get("/maintenance/sound/stop");
  }
}

module.exports = { WillowClient, WillowError };
