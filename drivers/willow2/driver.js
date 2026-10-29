"use strict";

const Homey = require("homey");

class Willow2Driver extends Homey.Driver {
  async onInit() {
    this.registerFlowCards();
    this.registerWidgetAutocomplete();
  }

  registerFlowCards() {
    const { flow } = this.homey;

    this.stateChangedTrigger = flow.getDeviceTriggerCard("mower_state_changed");
    this.stateChangedToTrigger = flow
      .getDeviceTriggerCard("mower_state_changed_to")
      .registerRunListener(async (args, state) => args.state === state.state);
    this.personDetectedTrigger = flow.getDeviceTriggerCard("person_detected");

    flow
      .getConditionCard("mower_state_is")
      .registerRunListener(
        async ({ device, state }) =>
          device.getCapabilityValue("mower_state") === state,
      );
    flow
      .getConditionCard("is_mowing")
      .registerRunListener(
        async ({ device }) => device.getCapabilityValue("mower_state") === "mowing",
      );
    flow
      .getConditionCard("is_emergency_stopped")
      .registerRunListener(
        async ({ device }) => device.getCapabilityValue("emergency_stop") === true,
      );

    const actions = {
      start_mowing: (device) => device.startMowing(),
      stop_mowing: (device) => device.stopMowing(),
      return_to_dock: (device) => device.returnToDock(),
      resume_schedule: (device) => device.resumeSchedule(),
      activate_emergency_stop: (device) => device.setEmergencyStop(true),
      release_emergency_stop: (device) => device.setEmergencyStop(false),
      clear_rain_sensor: (device) => device.clearRainSensor(),
      play_sound: (device, args) => device.playSound(args.volume),
      stop_sound: (device) => device.stopSound(),
      show_emotion: (device, args) => device.showEmotion(args.emotion),
      reboot_robot: (device) => device.reboot(),
    };
    for (const [id, run] of Object.entries(actions)) {
      flow
        .getActionCard(id)
        .registerRunListener((args) => run(args.device, args));
    }
  }

  /**
   * The dashboard widget's device picker is also registered by the legacy
   * driver. Whichever registers last wins, so list devices of both drivers.
   */
  registerWidgetAutocomplete() {
    try {
      this.homey.dashboards
        .getWidget("willow")
        .registerSettingAutocompleteListener("device", async (query) => {
          const devices = ["willow", "willow2"].flatMap((id) =>
            this.homey.drivers.getDriver(id).getDevices(),
          );
          return devices
            .map((device) => ({ name: device.getName(), id: device.getData().id }))
            .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
        });
    } catch (err) {
      this.error("Could not register widget autocomplete:", err);
    }
  }

  async onPairListDevices() {
    return Object.values(this.getDiscoveryStrategy().getDiscoveryResults()).map(
      (result) => ({
        name: "Willow",
        data: { id: result.id },
        store: { address: result.address },
      }),
    );
  }
}

module.exports = Willow2Driver;
