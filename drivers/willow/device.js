'use strict';

const { Device } = require('homey');
const fetch = require('node-fetch');

class MyDevice extends Device {

  /**
     * onInit is called when the device is initialized.
     */
  async onInit() {
    await this.getParameters(true);

    this.registerCapabilityListener('button.emergency', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/hardEmergencyStop`)
        .then(resp => this.log('Emergency request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending emergency request', err));
    });
    this.registerCapabilityListener('button.release_emergency', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/releaseEmergencyStop`)
        .then(resp => this.log('releaseEmergencyStop request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending release emergency request', err));
    });
    this.registerCapabilityListener('button.start_mowing', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/startmowing`)
        .then(resp => this.log('start_mowing request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending start_mowing request', err));
    });
    this.registerCapabilityListener('button.stop_mowing', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/stopmowing`)
        .then(resp => this.log('stop_mowing request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending stop_mowing request', err));
    });
    this.registerCapabilityListener('button.docking', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/startdocking`)
        .then(resp => this.log('Docking request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending docking request', err));
    });
    this.registerCapabilityListener('button.follow_me', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/autopilot?speed=0.4&object=person`)
        .then(resp => this.log('Follow me request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending Follow me request', err));
    });
    this.registerCapabilityListener('button.line_mowing', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/navigation/startlinemowing`)
        .then(resp => this.log('Line Mowing request sent!'))
        .then(resp => this.getParameters())
        .catch(err => this.log('Error while sending Line Mowing request', err));
    });
    this.registerCapabilityListener('button.reboot', async () => {
      await fetch(`http://${this.getSettings().ipaddress}:8080/maintenance/reboot`)
        .then(resp => this.log('Reboot request sent!'))
        .catch(err => this.log('Error while sending Reboot request', err));
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
    this.log('Willow settings where changed');
  }

  async getJson(endpoint) {
    return fetch(`http://${this.getSettings().ipaddress}:8080${endpoint}`)
      .then(resp => resp.json())
      .catch(err => this.error('Error while connecting to Willow', err));
  }

  async getParameters(startinterval = false) {
    this.log('Getting parameters', this.getSettings().interval * 1000);
    await this.getJson('/activities/info')
      .then(json => {
        this.setCapabilityValue('status.user_activity', json.userActivity).catch(this.error);
        this.setCapabilityValue('status.scheduled_activity', json.scheduledActivity).catch(this.error);
      })
      .catch(err => this.log('Error during activity info', err));

    await this.getJson('/system/batteryStatus')
      .then(json => {
        this.setCapabilityValue('measure_temperature.battery', json.temperature).catch(this.error);
        this.setCapabilityValue('measure_battery', json.percentage).catch(this.error);
      })
      .catch(err => this.log('Error during battery status', err));

    await this.getJson('/system/sensors/baseboard')
      .then(json => {
        this.setCapabilityValue('measure_temperature.motherboard', json.temperature).catch(this.error);
        this.setCapabilityValue('measure_humidity', json.humidity).catch(this.error);
      })
      .catch(err => this.log('Error during baseboard temperature & humidity', err));

    await this.getJson('/system/sensors/module')
      .then(json => {
        this.setCapabilityValue('measure_temperature.module', json.temperature).catch(this.error);
      })
      .catch(err => this.log('Error during module temperature', err));

    await this.getJson('/statuslog/sensors/power')
      .then(json => {
        this.setCapabilityValue('measure_current.charging_current', json.chg_bat_current).catch(this.error);
      })
      .catch(err => this.log('Error during charging current', err));

    await this.getJson('/system/mowerInfo')
      .then(json => {
        this.setCapabilityValue('rpm', json.rpm).catch(this.error);
      })
      .catch(err => this.log('Error during mower_rpm', err));
    if (startinterval) setTimeout(async () => this.getParameters(true), this.getSettings().interval * 1000);
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
