import fetch from 'node-fetch';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { RadiantCoolingPlatformPlugin } from './platform';
import { URLSearchParams } from 'url';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RadiantCoolingZoneAccessory {

  constructor(
    private readonly platform: RadiantCoolingPlatformPlugin,
    private readonly accessory: PlatformAccessory,
    private readonly zoneIndex: number,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Messana')
      .setCharacteristic(this.platform.Characteristic.Model, 'Zone')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'radiant-' + zoneIndex);

    // get the Theromostat service if it exists, otherwise create a new Thermostat service
    // you can create multiple services for each accessory
    const thermostatService = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    thermostatService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    thermostatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getHeatingCoolingState.bind(this));
    thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this));
    thermostatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
    thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');
    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    // const motionDetected = false;
    // setInterval(() => {
    //   // EXAMPLE - inverse the trigger
    //   motionDetected = !motionDetected;

    //   // push the new value to HomeKit
    //   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

    //   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    // }, 10000);
  }

  async getHeatingCoolingState(): Promise<CharacteristicValue> {
    return this.platform.messanaApiFetch('zone/thermalStatus/' + this.zoneIndex)
      .then(json => json['status']);
  }

  async getTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    return this.platform.messanaApiFetch('zone/status/' + this.zoneIndex)
      .then(json => {
        const zoneStatus = json['status'];
        // if zone is off, return off, else get the hc state from the overall system
        if (zoneStatus === 0) {
          return Promise.resolve(0);
        } else {
          return this.platform.messanaApiFetch('hc/mode/0')
            .then(json => json['value'] + 1);
        }
      });
  }

  async setTargetHeatingCoolingState(value: CharacteristicValue) {
    // messana zone only supports 0 or 1
    this.platform.messanaApiPut('zone/status', {
      'id': this.zoneIndex,
      'value': Math.min(1, value.valueOf() as number),
    });
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.platform.messanaApiFetch('zone/temperature/' + this.zoneIndex)
      .then(json => this.toCelsius(json['value']));
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    return this.platform.messanaApiFetch('zone/setpoint/' + this.zoneIndex)
      .then(json => this.toCelsius(json['value']));
  }

  async setTargetTemperature(value: CharacteristicValue) {
    const fahrenheit = this.toFahrenheit(value.valueOf() as number);

    // switch the zone on in case it was off before
    this.platform.messanaApiPut('zone/status', { 'id': this.zoneIndex, 'value': 1 });

    // try to disable the schedule in case the zone is off due to schedule
    // but this doesn't work currently because messana api has a bug such that
    // schedule can't be disabled through the scheduleOn api call

    // this.platform.messanaApiFetch('zone/scheduleStatus/' + this.zoneIndex)
    //   .then(json => {
    //     const isOffBySchedule = (json['value'] === 0);

    //     if (isOffBySchedule) {
    //       // disable schedule
    //       this.platform.messanaApiPut('zone/scheduleOn', { 'id': this.zoneIndex, 'value': 0 });

    //       // in an ideal case, put the schedule back on after some time has elapsed
    //       // because the temporary need has probably gone away
    //     }
    //   });

    this.platform.messanaApiPut('zone/setpoint', { 'id': this.zoneIndex, 'value': fahrenheit });
  }

  toCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5.0 / 9;
  }

  toFahrenheit(celsius: number): number {
    return celsius * 9.0 / 5 + 32;
  }
}

