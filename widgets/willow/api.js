"use strict";

module.exports = {
  async getWillowImage({ homey, query }) {
    return await homey.app.apiWillowImage(query.id);
  },
  async getWillowData({ homey, query }) {
    return await homey.app.apiWillowData(query.id);
  },
  async postWillowTask({ homey, body }) {
    return await homey.app.apiExecuteTask(body);
  },
};
