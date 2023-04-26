'use strict';

const { Device } = require('homey');
const axios = require('axios');
const fetch = require('node-fetch');

class MyDevice extends Device {

  // static ip;
  // static interval;
  // static alive = true;

  async axiosFetch(endpoint, _timeout = 3000) {
    const url = `http://${this.ip}:8080${endpoint}`;
    this.log(`Requesting ${url} with timeout ${_timeout}`);
    try {
      const resp = await axios.get(url, { timeout: _timeout });
      this.setAvailable().catch(this.error);
      return resp.data;
    } catch (error) {
      let errcode;
      if (error.response === undefined) errcode = 1; // Timeout
      if (error.response !== undefined && error.response.data.status === 404) errcode = 2; // 404 - Not Found
      const errMess = { error: true, error_code: errcode };
      this.log(`Error at endpoint ${endpoint}`, errMess);
      return errMess;
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
    await this.axiosFetch('/navigation/stopmowing');
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
    this.alive = true;
    this.is_error = false;
    this.error_message = '';
    this.ip = this.getSettings().ipaddress;
    this.interval = this.getSettings().interval;

    const myImage = await this.homey.images.createImage();
    myImage.setStream(async stream => {
      const res = await fetch(`http://${this.ip}:8080/image/front/img.jpg`);
      if (!res.ok) throw new Error('Invalid Response');
      return res.body.pipe(stream);
    });

    // Front camera image of Willow
    this.setCameraImage('front', this.homey.__('camera'), myImage).catch(this.error);

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

    this.homey.flow.getActionCard('play-sound').registerRunListener(async (args, state) => {
      this.playSound(args.Volume);
    });
    this.homey.flow.getActionCard('stop-sound').registerRunListener(async (args, state) => {
      this.stopSound();
    });

    // Conditions

    this.homey.flow.getConditionCard('is-in-emergency-stop').registerRunListener(async (args, state) => {
      await this.getParameters();
      return (this.scheduledActivity === 'EmergencyStop');
    });

    this.homey.flow.getConditionCard('is-mowing').registerRunListener(async (args, state) => {
      await this.getParameters();
      return (this.userActivity === 'MowActivity' || this.scheduledActivity === 'MowingPlannerActivity');
    });

    await this.getParameters(true);

    this.log('Willow has been initialized');
  }

  // Play a sound on Willow
  async playSound(volume = 60) {
    this.log('Playing sound with volume', volume);
    await this.axiosFetch(`/maintenance/sound/play?fileName=R2D2.wav&volume=${volume}`).catch(this.error);
  }

  // Stop playing a sound on Willow
  async stopSound() {
    this.log('Stopping sound');
    await this.axiosFetch('/maintenance/sound/stop').catch(this.error);
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

  checkError(params) {
    this.is_error = false;
    this.error_message = 0;
    params.forEach(element => {
      if (element.error !== undefined || !this.alive) {
        this.is_error = true;
        if (element.error_code === 1) this.error_message = this.homey.__('device_timeout');
        if (element.error_code === 2) this.error_message = this.homey.__('device_404');
      }
    });
    return this.is_error;
  }

  async getParameters(startinterval = false) {
    if (!this.alive) {
      this.log('Exiting, device has been removed');
      return;
    }
    this.log('Getting parameters, seconds:', this.interval);

    this.is_error = false;
    this.type_error = undefined;

    Promise.all([
      this.axiosFetch('/activities/info'),
      this.axiosFetch('/system/batteryStatus'),
      this.axiosFetch('/system/sensors/baseboard'),
      this.axiosFetch('/system/sensors/module'),
      this.axiosFetch('/system/mowerInfo'),
      this.axiosFetch('/system/dockingInfo'),
      this.axiosFetch('/statuslog/sensors/rain'),
    ])
      .then(values => {
        if (this.checkError(values)) {
          this.log('Setting device unavailable..');
          this.setUnavailable(this.error_message).catch(this.error);
          return;
        }
        this.setAvailable().catch(this.error);
        this.userActivity = values[0].userActivity;
        this.scheduledActivity = values[0].scheduledActivity;
        this.setCapabilityValue('status.user_activity', this.userActivity).catch(this.error);
        this.setCapabilityValue('status.scheduled_activity', this.scheduledActivity).catch(this.error);
        this.setCapabilityValue('measure_temperature.battery', values[1].temperature).catch(this.error);
        this.setCapabilityValue('measure_battery', values[1].percentage).catch(this.error);
        this.setCapabilityValue('measure_temperature.motherboard', values[2].temperature).catch(this.error);
        this.setCapabilityValue('measure_humidity', values[2].humidity).catch(this.error);
        this.setCapabilityValue('measure_temperature.module', values[3].temperature).catch(this.error);
        this.setCapabilityValue('rpm', values[4].rpm).catch(this.error);
        this.setCapabilityValue('height', Math.round(values[4].mowerHeight * 1000) / 10).catch(this.error);
        this.setCapabilityValue('measure_current.charging_current', values[5].chargingCurrent).catch(this.error);
        this.setCapabilityValue('measure_power', values[5].chargingPower).catch(this.error);
        this.setCapabilityValue('status.docking_state', values[5].dockingState).catch(this.error);
        this.setCapabilityValue('alarm_water', values[6].state === 1).catch(this.error);
      }).catch(this.error);

    this.log('Getting parameters done!');

    // this.setUnavailable(this.homey.__('device_timeout')).catch(this.error);
    // this.setUnavailable(this.homey.__('device_404')).catch(this.error);

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
    this.alive = false;
  }

}

module.exports = MyDevice;
