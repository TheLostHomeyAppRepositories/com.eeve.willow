'use strict';

const Homey = require('homey');

class Driver extends Homey.Driver {

  async guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  async onPairListDevices() {
    return {
      name: 'Willow',
      data: {
        id: this.guid(),
      },
      settings: {
        ipaddress: '192.168.0.0',
        interval: 60,
      },
    };
  }

}

module.exports = Driver;