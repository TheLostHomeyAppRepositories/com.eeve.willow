"use strict";

const Homey = require("homey");
const { WillowClient } = require("../../lib/WillowClient");
const { deriveMowerState, ACTIVE_STATES } = require("../../lib/mowerState");
const { sameReasons } = require("../../lib/emergencyStop");

const POLL_INTERVAL_ACTIVE = 15 * 1000;
const POLL_INTERVAL_IDLE = 60 * 1000;
const POLL_DELAY_AFTER_COMMAND = 2 * 1000;
const PERSON_POLL_INTERVAL = 10 * 1000;
const PERSON_MIN_MOVEMENT = 0.05; // meters
const PERSON_CLEAR_AFTER_POLLS = 3;

/** Capabilities that are only shown when the "diagnostics" setting is enabled. */
const DIAGNOSTIC_CAPABILITIES = [
  "status.activity",
  "status.docking",
  "rpm",
  "measure_current.charging",
  "measure_current.blades",
  "measure_current.wheel_left",
  "measure_current.wheel_right",
  "measure_voltage.battery",
  "measure_voltage.receiver",
  "measure_temperature.motherboard",
  "measure_humidity.motherboard",
  "measure_temperature.module",
  "accuracy",
  "measure_location_latitude",
  "measure_location_longitude",
];

const round = (value, decimals = 1) =>
  typeof value === "number" ? Number(value.toFixed(decimals)) : null;

/**
 * The spec documents mowing times as minutes, but firmware 6.8 reports them in
 * seconds. `today` is a two-number array: the first matches the zones'
 * `elapsedMowingTimeToday` (time spent actually mowing), the second is larger
 * and presumably includes driving to and between zones.
 */
const toMinutes = (seconds) => (typeof seconds === "number" ? seconds / 60 : null);

class Willow2Device extends Homey.Device {
  async onInit() {
    this.client = new WillowClient(this.getStoreValue("address"));
    this.lastValues = {};

    // Added after the first release of this driver.
    if (!this.hasCapability("emergency_reason")) {
      await this.addCapability("emergency_reason").catch(this.error);
    }
    await this.syncDiagnosticCapabilities(this.getSetting("diagnostics"));
    this.registerCapabilityListeners();
    await this.setupCamera();

    this.refreshRobotInfo();
    this.poll();
    this.pollPersonDetection();
  }

  async onUninit() {
    this.stopTimers();
  }

  async onDeleted() {
    this.stopTimers();
  }

  stopTimers() {
    this.homey.clearTimeout(this.pollTimer);
    this.homey.clearTimeout(this.personTimer);
    this.pollTimer = null;
    this.personTimer = null;
    this.stopped = true;
  }

  // mDNS discovery

  onDiscoveryResult(result) {
    return result.id === this.getData().id;
  }

  async onDiscoveryAvailable(result) {
    await this.updateAddress(result.address);
  }

  async onDiscoveryAddressChanged(result) {
    await this.updateAddress(result.address);
  }

  async onDiscoveryLastSeenChanged(result) {
    await this.updateAddress(result.address);
    if (!this.getAvailable()) this.poll();
  }

  async updateAddress(address) {
    if (!address || address === this.client.address) return;
    this.log("Robot address is now", address);
    this.client.address = address;
    await this.setStoreValue("address", address).catch(this.error);
    this.refreshRobotInfo();
    this.poll();
  }

  // Setup

  registerCapabilityListeners() {
    this.registerCapabilityListener("emergency_stop", (value) =>
      this.setEmergencyStop(value),
    );
    this.registerCapabilityListener("button.start_mowing", () => this.startMowing());
    this.registerCapabilityListener("button.stop_mowing", () => this.stopMowing());
    this.registerCapabilityListener("button.dock", () => this.returnToDock());
    this.registerCapabilityListener("button.reboot", () => this.reboot());
  }

  async setupCamera() {
    try {
      const video = await this.homey.videos.createVideoRTSP();
      video.registerVideoUrlListener(async () => {
        this.log("Opening camera stream", this.client.rtspUrl);
        return { url: this.client.rtspUrl };
      });
      await this.setCameraVideo("front", this.homey.__("camera"), video);
    } catch (err) {
      this.error("Could not set up camera video:", err);
    }
  }

  async syncDiagnosticCapabilities(enabled) {
    for (const capability of DIAGNOSTIC_CAPABILITIES) {
      if (enabled && !this.hasCapability(capability)) {
        await this.addCapability(capability).catch(this.error);
      } else if (!enabled && this.hasCapability(capability)) {
        await this.removeCapability(capability).catch(this.error);
      }
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes("diagnostics")) {
      await this.syncDiagnosticCapabilities(newSettings.diagnostics);
      this.poll();
    }
  }

  async refreshRobotInfo() {
    try {
      const [version, hardware] = await Promise.all([
        this.client.getVersion(),
        this.client.getHardwareInfo(),
      ]);
      await this.setSettings({
        address: this.client.address,
        serial: hardware.serialNumber || this.getData().id,
        firmware: version.applicationVersion || "",
        hardware: hardware.hardwareVersion || "",
      });
    } catch (err) {
      this.log("Could not read robot info:", err.message);
    }
  }

  // Polling

  async poll() {
    if (this.stopped) return;
    this.homey.clearTimeout(this.pollTimer);

    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;

    let state = this.getCapabilityValue("mower_state");
    try {
      state = await this.updateStatus();
      await this.setAvailable();
    } catch (err) {
      this.error("Poll failed:", err.message);
      await this.setUnavailable(this.translateError(err)).catch(this.error);
    } finally {
      this.polling = false;
    }

    if (this.stopped) return;
    const delay = this.pollAgain
      ? 0
      : ACTIVE_STATES.has(state)
        ? POLL_INTERVAL_ACTIVE
        : POLL_INTERVAL_IDLE;
    this.pollAgain = false;
    this.pollTimer = this.homey.setTimeout(() => this.poll(), delay);
  }

  /** Fetches everything from the robot and updates capabilities. Returns the new mower state. */
  async updateStatus() {
    const { client } = this;
    const diagnostics = this.getSetting("diagnostics");

    // Without these we can't tell what the robot is doing, so failing here marks the device unavailable.
    const [activities, battery, docking, emergencyReasons] = await Promise.all([
      client.getActivities(),
      client.getBatteryStatus(),
      client.getDockingInfo(),
      client.getEmergencyStopReasons(),
    ]);
    const inEmergency = emergencyReasons.length > 0;

    const [mower, mowing, rain, power, baseboard, module, odometry] = await Promise.all(
      [
        client.getMowerInfo(),
        client.getMowingInfo(),
        client.getRainSensor(),
        client.getPowerSensor(),
        client.getBaseboardSensors(),
        diagnostics && client.getModuleSensors(),
        diagnostics && client.getOdometry(),
      ].map((request) => Promise.resolve(request).catch(() => null)),
    );

    if (mowing && !this.loggedMowingTime) {
      this.loggedMowingTime = true;
      this.log("mowingTime as reported by the robot:", JSON.stringify(mowing.mowingTime));
    }

    const state = deriveMowerState({ inEmergency, activities, docking });
    await this.setMowerState(state);
    await this.setEmergencyReasons(emergencyReasons);

    this.lastValues = {
      chargingCurrent: docking.chargingCurrent,
      boardTemperature: baseboard?.temperature,
      activity: activities.userActivity || activities.scheduledActivity || "",
    };

    await this.setValues({
      emergency_stop: inEmergency,
      measure_battery: battery.percentage,
      // The spec says seconds, but the robot reports minutes.
      remaining_mowing_time: round(battery.availableMowingTime, 0),
      "measure_temperature.battery": battery.temperature,
      // What the robot draws from the charging station. dockingInfo.chargingPower
      // stays 0 while the robot idles on the dock with a full battery.
      measure_power: power?.receiver_power,
      blade_height: round(mower?.mowerHeight * 100),
      mowing_time_today: round(toMinutes(mowing?.mowingTime?.today?.[0]), 0),
      mowing_time_total: round(toMinutes(mowing?.mowingTime?.total) / 60),
      alarm_water: rain ? rain.state === 1 : null,
    });

    if (diagnostics) {
      await this.setValues({
        "status.activity": this.lastValues.activity || "-",
        "status.docking": docking.dockingState,
        rpm: mower?.rpm,
        "measure_current.charging": docking.chargingCurrent,
        "measure_current.blades": power?.mower_current,
        "measure_current.wheel_left": power?.left_wheel_current,
        "measure_current.wheel_right": power?.right_wheel_current,
        "measure_voltage.battery": power?.chg_bat_voltage,
        "measure_voltage.receiver": power?.receiver_voltage,
        "measure_temperature.motherboard": baseboard?.temperature,
        "measure_humidity.motherboard": baseboard?.humidity,
        "measure_temperature.module": module?.temperature,
        accuracy: odometry?.acc,
        measure_location_latitude: odometry?.lat,
        measure_location_longitude: odometry?.lon,
      });
    }

    return state;
  }

  async setValues(values) {
    for (const [capability, value] of Object.entries(values)) {
      if (value === undefined || value === null || Number.isNaN(value)) continue;
      if (!this.hasCapability(capability)) continue;
      if (typeof value === "object") {
        this.log(`Skipping ${capability}, unexpected value:`, JSON.stringify(value));
        continue;
      }
      await this.setCapabilityValue(capability, value).catch(this.error);
    }
  }

  async setMowerState(state) {
    const previous = this.getCapabilityValue("mower_state");
    if (state === previous) return;

    await this.setCapabilityValue("mower_state", state);
    if (previous === null) return;

    const title = this.homey.__(`state.${state}`);
    this.log(`State changed from ${previous} to ${state}`);
    this.driver.stateChangedTrigger
      .trigger(this, { state: title })
      .catch(this.error);
    this.driver.stateChangedToTrigger
      .trigger(this, {}, { state })
      .catch(this.error);
  }

  /**
   * Several reasons can be active at once. The trigger fires when the robot
   * enters an emergency stop, and again whenever another reason is added.
   * The last reasons are kept in the store so an app restart doesn't re-trigger.
   */
  async setEmergencyReasons(reasons) {
    await this.setValues({
      emergency_reason: reasons.length
        ? this.describeEmergencyReasons(reasons)
        : this.homey.__("emergency_reason.none"),
    });

    const previous = this.getStoreValue("emergencyReasons");
    if (previous && sameReasons(previous, reasons)) return;
    await this.setStoreValue("emergencyReasons", reasons).catch(this.error);
    if (!previous) return;

    const added = reasons.filter((reason) => !previous.includes(reason));
    this.log("Emergency stop reasons changed to", JSON.stringify(reasons));
    if (added.length === 0) return;

    this.driver.emergencyStopTrigger
      .trigger(this, {
        reasons: this.describeEmergencyReasons(reasons),
        codes: reasons.join(", "),
        new_codes: added.join(", "),
      })
      .catch(this.error);
  }

  /** Translated reasons. Codes we don't know yet are shown as reported by the robot. */
  describeEmergencyReasons(reasons) {
    return reasons
      .map((code) => {
        const key = `emergency_reason.${code}`;
        const label = this.homey.__(key);
        return label && label !== key ? label : code;
      })
      .join(", ");
  }

  /**
   * The robot keeps returning the last detected distance long after the person
   * is gone (the spec claims 10 seconds), with only sub-millimetre jitter. So a
   * detection only counts when the distance actually moved since the last poll.
   */
  async pollPersonDetection() {
    if (this.stopped) return;
    try {
      const distance = await this.client.getPersonDistance();
      const previous = this.lastPersonDistance;
      this.lastPersonDistance = distance;

      const isNewDetection =
        distance !== null &&
        previous !== undefined &&
        (previous === null || Math.abs(distance - previous) > PERSON_MIN_MOVEMENT);

      if (isNewDetection) {
        this.personQuietPolls = 0;
        if (!this.getCapabilityValue("alarm_motion")) {
          this.log("Person detected at", distance, "m");
          this.driver.personDetectedTrigger
            .trigger(this, { distance: round(distance, 2) })
            .catch(this.error);
          await this.setCapabilityValue("alarm_motion", true);
        }
      } else if (this.getCapabilityValue("alarm_motion") !== false) {
        this.personQuietPolls = (this.personQuietPolls || 0) + 1;
        if (this.personQuietPolls >= PERSON_CLEAR_AFTER_POLLS || previous === undefined) {
          await this.setCapabilityValue("alarm_motion", false);
        }
      }
    } catch (err) {
      // Connection problems are reported by the main poll.
    }
    if (this.stopped) return;
    this.personTimer = this.homey.setTimeout(
      () => this.pollPersonDetection(),
      PERSON_POLL_INTERVAL,
    );
  }

  translateError(err) {
    switch (err.code) {
      case "offline":
        return this.homey.__("errors.offline");
      case "not_found":
        return this.homey.__("errors.not_supported");
      default:
        return this.homey.__("errors.unknown");
    }
  }

  // Commands

  async command(run) {
    try {
      await run(this.client);
    } catch (err) {
      this.error("Command failed:", err.message);
      throw new Error(this.translateError(err));
    }
    this.homey.clearTimeout(this.pollTimer);
    this.pollTimer = this.homey.setTimeout(() => this.poll(), POLL_DELAY_AFTER_COMMAND);
  }

  startMowing() {
    return this.command((client) => client.startMowing());
  }

  stopMowing() {
    return this.command((client) => client.stopMowing());
  }

  returnToDock() {
    return this.command((client) => client.dock());
  }

  resumeSchedule() {
    return this.command((client) => client.resumeSchedule());
  }

  setEmergencyStop(active) {
    return this.command((client) =>
      active ? client.activateEmergencyStop() : client.releaseEmergencyStop(),
    );
  }

  clearRainSensor() {
    return this.command((client) => client.clearRainSensor());
  }

  reboot() {
    return this.command((client) => client.reboot());
  }

  playSound(volume) {
    return this.command((client) => client.playSound(volume));
  }

  stopSound() {
    return this.command((client) => client.stopSound());
  }

  showEmotion(emotion) {
    return this.command((client) => client.showEmotion(emotion));
  }

  // Dashboard widget (see app.js)

  async getWidgetImage() {
    const res = await fetch(this.client.snapshotUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Invalid response: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  getWidgetData() {
    return {
      battery: this.getCapabilityValue("measure_battery"),
      chargingCurrent: this.lastValues.chargingCurrent,
      user_activity: this.homey.__(`state.${this.getCapabilityValue("mower_state")}`),
      scheduled_activity: "",
      temperature_motherboard: this.lastValues.boardTemperature,
      temperature_battery: this.getCapabilityValue("measure_temperature.battery"),
      measure_power: this.getCapabilityValue("measure_power"),
      in_emergency: this.getCapabilityValue("emergency_stop"),
      ip: this.client.address,
    };
  }

  async runWidgetTask(description) {
    switch (description) {
      case "emergency_button":
        return this.setEmergencyStop(!this.getCapabilityValue("emergency_stop"));
      case "grass_button":
        return this.startMowing();
      case "home_button":
        return this.returnToDock();
      default:
        return undefined;
    }
  }
}

module.exports = Willow2Device;
