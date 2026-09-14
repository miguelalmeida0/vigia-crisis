import { immutable } from '../intelligence/shared.mjs';
import { PRODUCT_MATURITIES,enumValue } from './constants.mjs';

export function normalizeQuality(input={}){
  const missing=(input.requiredFields??[]).filter((field)=>input.native?.[field]===null||input.native?.[field]===undefined);
  const coordinates=input.coordinate??[],validCoordinates=Array.isArray(coordinates)&&coordinates.length===2&&coordinates.every(Number.isFinite)&&coordinates[0]>=-180&&coordinates[0]<=180&&coordinates[1]>=-90&&coordinates[1]<=90;
  return immutable({schemaVersion:'vigia.provider-quality.v1',validity:missing.length||!validCoordinates?'INVALID':'VALID',providerQualityClass:input.providerQualityClass??null,geolocationConfidence:input.geolocationConfidence??'UNKNOWN',temporalPrecision:input.temporalPrecision??'UNKNOWN',provenanceStrength:String(input.provenanceStrength??'ATTRIBUTED').toUpperCase(),obstructionState:input.obstructionState??'UNKNOWN',saturation:Boolean(input.saturation),viewGeometry:structuredClone(input.viewGeometry??null),algorithmFlags:[...(input.algorithmFlags??[])].sort(),productMaturity:enumValue(input.productMaturity,PRODUCT_MATURITIES,'invalid_product_maturity'),processingMode:String(input.processingMode??'UNKNOWN').toUpperCase(),missingFields:missing.sort(),anomalyWarnings:[...(input.anomalyWarnings??[])].sort(),native:structuredClone(input.native??{})});
}
