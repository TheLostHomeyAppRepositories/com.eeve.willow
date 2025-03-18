"use strict";

const Homey = require("homey");

class App extends Homey.App {
  async onInit() {
    this.log("Started");
  }

  /** WIDGET API */

  async apiWillowImage(id) {
    this.log("Getting image for device ID:", id);
    const device = this.homey.drivers.getDriver("willow").getDevice({ id });
    if (!device) throw new Error("Device not found");
    const image = device.myImage;
    if (!image) throw new Error("Image not initialized");

    // Fetch the updated image stream
    const stream = await image.getStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  async apiWillowData(id) {
    this.log("Getting data for device ID:", id);

    const device = this.homey.drivers.getDriver("willow").getDevice({ id });
    if (!device) throw new Error("Device not found");

    await device.getParameters().catch(this.error);

    let data = {};
    data.battery = device.getCapabilityValue("measure_battery");
    data.chargingCurrent = device.getCapabilityValue(
      "measure_current.charging_current"
    );
    data.user_activity = device.getCapabilityValue("status.user_activity");
    data.scheduled_activity = device.getCapabilityValue(
      "status.scheduled_activity"
    );
    data.temperature_motherboard = device.getCapabilityValue(
      "measure_temperature.motherboard"
    );
    data.temperature_battery = device.getCapabilityValue(
      "measure_temperature.battery"
    );
    data.measure_power = device.getCapabilityValue("measure_power");
    data.in_emergency = await device.api.checkInEmergency();
    data.ip = device.ip;

    return data;
  }

  async apiExecuteTask(task) {
    this.log("Executing task for device", task);
    const device = this.homey.drivers
      .getDriver("willow")
      .getDevice({ id: task.id });
    if (!device) throw new Error("Device not found");

    switch (task.description) {
      case "emergency_button":
        const in_emergency = await device.api
          .checkInEmergency()
          .catch(this.error);
        if (in_emergency) await device.api.releaseEmergency().catch(this.error);
        else await device.api.activateEmergency().catch(this.error);
        break;
      case "grass_button":
        await device.api.startMowing().catch(this.error);
        break;
      case "home_button":
        await device.goDocking().catch(this.error);
        break;
      default:
        break;
    }
  }
}

module.exports = App;
