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

  /**
     * onInit is called when the device is initialized.
     */
  async onInit() {
    this.ip = this.getSettings().ipaddress;
    this.interval = this.getSettings().interval;

    await this.getParameters(true);

    this.registerCapabilityListener('button.emergency', async () => {
      await this.axiosFetch('/navigation/hardEmergencyStop');
      await this.getParameters();
    });

    this.registerCapabilityListener('button.release_emergency', async () => {
      await this.axiosFetch('/navigation/releaseEmergencyStop');
      await this.getParameters();
    });

    this.registerCapabilityListener('button.start_mowing', async () => {
      await this.axiosFetch('/navigation/startmowing');
      await this.getParameters();
    });

    this.registerCapabilityListener('button.stop_mowing', async () => {
      await this.axiosFetch('/navigation/stopmowing');
      await this.getParameters();
    });

    this.registerCapabilityListener('button.docking', async () => {
      await this.axiosFetch('/navigation/startdocking');
      await this.getParameters();
    });

    // this.registerCapabilityListener('button.follow_me', async () => {
    //   await this.axiosFetch('/navigation/autopilot?speed=0.4&object=person');
    //   await this.getParameters();
    // });

    // this.registerCapabilityListener('button.line_mowing', async () => {
    //   await this.axiosFetch('/navigation/startlinemowing');
    //   await this.getParameters();
    // });

    this.registerCapabilityListener('button.reboot', async () => {
      await this.axiosFetch('/maintenance/reboot');
      await this.getParameters();
    });

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

    this.axiosFetch('/statuslog/sensors/power')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('measure_current.charging_current', json.chg_bat_current).catch(this.error);
      });

    this.axiosFetch('/system/mowerInfo')
      .then(json => {
        if (json.error !== undefined) return;
        this.setCapabilityValue('rpm', json.rpm).catch(this.error);
      });

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
