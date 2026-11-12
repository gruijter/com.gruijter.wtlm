/*
Copyright 2021 - 2024, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.wtlm.

com.gruijter.wtlm is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.wtlm is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.gruijter.wtlm. If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
const Logger = require('./captureLogs');

class App extends Homey.App {

  async onInit() {
    process.env.LOG_LEVEL = 'info'; // info or debug
    if (!this.logger) this.logger = new Logger({ name: 'log', length: 500, homey: this.homey });
    this.log('Wireless Tank Level Meter app is running...');

    // provide the tank list for the widget settings
    ['tank-level', 'tank-details'].forEach((widgetId) => {
      this.homey.dashboards.getWidget(widgetId)
        .registerSettingAutocompleteListener('device', async (query) => this.homey.drivers.getDriver('ts_ft002').getDevices()
          .map((device) => ({ name: device.getName(), id: String(device.getData().id) }))
          .filter((item) => item.name.toLowerCase().includes(query.toLowerCase())));
    });

    // register some listeners
    this.homey
      .on('unload', async () => {
        this.log('app unload called');
        // save logs to persistant storage
        await this.logger.saveLogs();
      })
      .on('memwarn', () => {
        this.log('memwarn!');
      });
  }

  // async onUninit() {
  //  try {
  //   this.logger.saveLogs();
  //  } catch (error) { this.error(error); }
  // }

  //  stuff for frontend API
  deleteLogs() {
    return this.logger.deleteLogs();
  }

  getLogs() {
    return this.logger.logArray;
  }

  //  stuff for the dashboard widgets
  getWidgetData(id, withHistory) {
    const devices = this.homey.drivers.getDriver('ts_ft002').getDevices();
    if (!devices.length) return null;
    const device = devices.find((dev) => String(dev.getData().id) === id) || devices[0];
    const { tank_capacity: capacity, alarm_level: alarmLevel } = device.getSettings();
    const waterMeter = device.getCapabilityValue('meter_water'); // in m3
    return {
      name: device.getName(),
      available: device.getAvailable(),
      lastUpdated: device.lastUpdated || null,
      fillRatio: device.getCapabilityValue('fill_ratio'),
      volume: typeof waterMeter === 'number' ? Math.round(waterMeter * 1000) : null, // in liter
      capacity,
      alarmLevel,
      airGap: device.getCapabilityValue('air_gap'),
      temperature: device.getCapabilityValue('measure_temperature'),
      alarmWater: device.getCapabilityValue('alarm_water'),
      alarmBattery: device.getCapabilityValue('alarm_battery'),
      history: withHistory ? (device.getStoreValue('history') || []) : undefined,
    };
  }

}

module.exports = App;
