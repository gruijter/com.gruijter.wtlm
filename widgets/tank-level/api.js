'use strict';

module.exports = {

  async getTank({ homey, query }) {
    return homey.app.getWidgetData(query.id, false);
  },

};
