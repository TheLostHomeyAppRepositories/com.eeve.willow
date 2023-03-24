const Homey = require("homey");
const { v4: uuidv4 } = require('uuid');

class Driver extends Homey.Driver {
  // this method is called when the app is started and the Driver is inited
  async onInit() {
  }
  
  // This method is called when a user is adding a device
  // and the 'list_devices' view is called
  async onPairListDevices() {
    return [
      {
        name: 'Willow',
        data: {
          id: uuidv4(),
        },
        settings: {
          ipaddress: '192.168.0.0',
          interval: 60,
        },
      },
    ];
  }
}

module.exports = Driver;