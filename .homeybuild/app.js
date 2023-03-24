'use strict';

const Homey = require('homey');

class App extends Homey.App {

  async onInit() {
    this.log('Started');
  }

}

module.exports = App;
