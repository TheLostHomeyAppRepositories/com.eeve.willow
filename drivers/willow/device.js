'use strict';

const { Device } = require('homey');
const axios = require('axios');

class MyDevice extends Device {

  static ip;
  static interval;

  async axiosFetch(endpoint, _timeout = 3000) {
    const url = `http://${this.ip}:8080${endpoint}`;
    this.log(`Requesting ${url} with timeout ${_timeout}`);
    try {
      const resp = await axios.get(url, { timeout: _timeout });
      return resp.data;
    } catch (error) {
      let errMessage;
      if (error.response === undefined) errMessage = 'Timeout';
      if (error.response !== undefined && error.response.data.status === 404) errMessage = '404 - Not Found';
      const fullMessage = { error: true, error_message: errMessage };
      this.log(`Error at endpoint ${endpoint}`, fullMessage);
      return fullMessage;
    }
  }

  async activateEmergency() {
    await this.axiosFetch('/navigation/hardEmergencyStop');
    await this.getParameters();
  }

  async releaseEmergency() {
    await this.axiosFetch('/navigation/releaseEmergencyStop');
    await this.getParameters();
  }

  async startMowing() {
    await this.axiosFetch('/navigation/startmowing');
    await this.getParameters();
  }

  async stopMowing() {
    await this.axiosFetch('/navigation/stopmowing');
    await this.getParameters();
  }

  async docking() {
    await this.axiosFetch('/navigation/startdocking');
    await this.getParameters();
  }

  async reboot() {
    await this.axiosFetch('/maintenance/reboot');
    await this.getParameters();
  }

  /**
     * onInit is called when the device is initialized.
     */
  async onInit() {
    this.ip = this.getSettings().ipaddress;
    this.interval = this.getSettings().interval;

    await this.getParameters(true);

    this.registerCapabilityListener('button.emergency', async () => this.activateEmergency());
    this.homey.flow.getActionCard('activate-emergency').registerRunListener(async (args, state) => this.activateEmergency());

    this.registerCapabilityListener('button.release_emergency', async () => this.releaseEmergency());
    this.homey.flow.getActionCard('release-emergency').registerRunListener(async (args, state) => this.releaseEmergency());

    this.registerCapabilityListener('button.start_mowing', async () => this.startMowing());
    this.homey.flow.getActionCard('start-random-mowing').registerRunListener(async (args, state) => this.startMowing());

    this.registerCapabilityListener('button.stop_mowing', async () => this.stopMowing());
    this.homey.flow.getActionCard('stop-random-mowing').registerRunListener(async (args, state) => this.stopMowing());

    this.registerCapabilityListener('button.docking', async () => this.docking());
    this.homey.flow.getActionCard('go-docking').registerRunListener(async (args, state) => this.docking());

    this.registerCapabilityListener('button.reboot', async () => this.reboot());
    this.homey.flow.getActionCard('reboot').registerRunListener(async (args, state) => this.reboot());

    this.log('Willow has been initialized');
  }

  /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
  async onAdded() {
    this.log('Willow has been added');
  }

  /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (newSettings.ipaddress !== undefined) this.ip = newSettings.ipaddress;
    if (newSettings.interval !== undefined) this.interval = newSettings.interval;
    this.getParameters();
  }

  async getParameters(startinterval = false) {
    this.log('Getting parameters', this.interval * 1000);

    this.axiosFetch('/activities/info')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('status.user_activity', json.userActivity).catch(this.error);
        this.setCapabilityValue('status.scheduled_activity', json.scheduledActivity).catch(this.error);
      });

    this.axiosFetch('/system/batteryStatus')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('measure_temperature.battery', json.temperature).catch(this.error);
        this.setCapabilityValue('measure_battery', json.percentage).catch(this.error);
      });

    this.axiosFetch('/system/sensors/baseboard')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('measure_temperature.motherboard', json.temperature).catch(this.error);
        this.setCapabilityValue('measure_humidity', json.humidity).catch(this.error);
      });

    this.axiosFetch('/system/sensors/module')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('measure_temperature.module', json.temperature).catch(this.error);
      });

    this.axiosFetch('/system/mowerInfo')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('rpm', json.rpm).catch(this.error);
        this.setCapabilityValue('height', Math.round(json.mowerHeight * 1000) / 10).catch(this.error);
      });

    this.axiosFetch('/system/dockingInfo')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('measure_current.charging_current', json.chargingCurrent).catch(this.error);
        this.setCapabilityValue('measure_power.charging_power', json.chargingPower).catch(this.error);
      });

    this.axiosFetch('/statuslog/sensors/rain')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('alarm_water', json.state === 1).catch(this.error);
      });

    // http://192.168.10.50:8080/system/dockingInfo

    if (startinterval) setTimeout(async () => this.getParameters(true), this.interval * 1000);
  }

  /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
  async onRenamed(name) {
    this.log('Willow was renamed');
  }

  /**
     * onDeleted is called when the user deleted the device.
     */
  async onDeleted() {
    this.log('Willow has been deleted');
  }

}

module.exports = MyDevice;
