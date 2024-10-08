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

class MyDevice extends Homey.Device {

  async onInit() {
    this.log(`device ready: ${this.getName()}`);

    // start listening to driver
    this.eventListener = (info) => {
      const { ignore_id: ignoreId, random_id: randomId } = this.getSettings();

      // check if message is for this device
      const idMatch = (info.crcValid && ((randomId === info.randomID.toString()) || randomId > 255));
      if (!idMatch && !ignoreId) return;

      // update setting label on changed
      if (randomId !== info.randomID.toString()) this.setSettings({ random_id: info.randomID.toString() });

      // update Homey device
      this.handleInfo(info);

      // reset watchdog
      this.startWatchdog(3 * 60 * 60 * 1000);
    };
    this.homey.on('infoReceived', this.eventListener);

    // set watchdogTimer
    this.startWatchdog(3 * 60 * 60 * 1000);
  }

  startWatchdog(delay) {
    this.setAvailable();
    clearTimeout(this.timeOut);
    this.timeOut = this.homey.setTimeout(() => {
      this.error('No valid data received for a long time.');
      this.setUnavailable('No valid data received for a long time.');
    }, delay);
  }

  async onAdded() {
    try {
      this.log(`${this.getData().id} added: ${this.getName()}`);
      const firstId = Object.keys(this.driver.discoveredDevices)[0];
      if (!firstId) return;
      let addedId = this.getSettings().random_id;
      if (addedId === '256') {
        addedId = firstId;
        this.setSettings({ random_id: addedId });
      }
      const discoveredInfo = this.driver.discoveredDevices[addedId];
      if (discoveredInfo) this.handleInfo(discoveredInfo);
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings() { // { oldSettings, newSettings, changedKeys }
    this.log('Device settings where changed');
  }

  async onRenamed(name) {
    this.log('Device was renamed:', name);
  }

  async onDeleted() {
    this.log(`${this.getData().id} deleted: ${this.getName()}`);
    this.homey.removeListener('infoReceived', this.eventListener);
    clearTimeout(this.timeOut);
  }

  setCapability(capability, value) {
    if (this.hasCapability(capability)) {
      this.setCapabilityValue(capability, value)
        .catch((error) => {
          this.log(error, capability, value);
        });
    }
  }

  handleInfo(info) {
    try {
      const {
        tank_capacity: tankCapacity, max_air_gap: maxAirGap, min_air_gap: minAirGap, alarm_level: alarmLevel,
        ignore_out_of_range: ignoreOOR,
      } = this.getSettings();

      // update temp and bat state
      const lowBat = info.batState !== 8;
      this.setCapability('measure_temperature', info.temp);
      this.setCapability('alarm_battery', lowBat);

      // update other states if air gap is within range
      const ignoreAirGap = ignoreOOR && ((info.airGap > maxAirGap) || (info.airGap < minAirGap));
      if (!ignoreAirGap) {
        // calculate device info
        let fillRatio = Math.round(100 * ((maxAirGap - info.airGap) / (maxAirGap - minAirGap)));
        fillRatio = Math.sign(fillRatio) === 1 ? fillRatio : 0;
        const waterMeter = (fillRatio * tankCapacity) / 100000; // in m3
        const waterAlarm = fillRatio < alarmLevel;

        this.setCapability('air_gap', info.airGap);
        this.setCapability('fill_ratio', fillRatio);
        this.setCapability('meter_water', waterMeter);
        this.setCapability('alarm_water', waterAlarm);

        // trigger custom capability flow cards
        if (info.airGap !== this.getCapabilityValue('air_gap')) {
          this.homey.flow.getDeviceTriggerCard('air_gap_changed')
            .trigger(this, {})
            .catch(this.error);
        }
      } else this.log('Air gap info is out of range:', info.airGap);
    } catch (error) {
      this.error(error.message || error);
    }
  }

}

module.exports = MyDevice;
