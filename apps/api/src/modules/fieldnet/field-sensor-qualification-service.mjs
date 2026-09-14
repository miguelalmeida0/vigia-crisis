import { readJson } from '../../shared/json-file.mjs';
import { qualifyProductionFieldSensor } from '../../../../../packages/domain/src/fieldnet/contracts.mjs';

export class FieldSensorQualificationService {
  constructor({ hardwareInventoryFile, clock = () => new Date() } = {}) { Object.assign(this,{hardwareInventoryFile,clock}); }
  async status() { const hardwareInventory=await readJson(this.hardwareInventoryFile,{sensorHardware:'NOT_PRESENT',qualification:'No governed hardware inventory is available.'});return qualifyProductionFieldSensor({hardwareInventory,now:this.clock()}); }
  async evaluate({ registration, heldOutValidation } = {}) { const hardwareInventory=await readJson(this.hardwareInventoryFile,{sensorHardware:'NOT_PRESENT'});return qualifyProductionFieldSensor({hardwareInventory,registration,heldOutValidation,now:this.clock()}); }
}
