import { immutable } from '../intelligence/shared.mjs';
import { OBSERVATION_OPPORTUNITY_STATES,enumValue } from './constants.mjs';

export function evaluateObservationOpportunity({source,geometry,timeWindow,productAvailability,coverage,quality,detections=[]}={}){
  let state='UNKNOWN',reason='Observation opportunity cannot be established from the supplied metadata.';
  if(source?.status==='UNAVAILABLE'||source?.status==='RATE_LIMITED'){state='PROVIDER_UNAVAILABLE';reason=`Provider state is ${source.status}.`;}
  else if(productAvailability?.state==='NOT_YET_AVAILABLE'){state='NOT_YET_AVAILABLE';reason='The expected product has not arrived by knowledge time.';}
  else if(productAvailability?.state!=='AVAILABLE'){state='PRODUCT_UNAVAILABLE';reason='No attributable provider product is available.';}
  else if(coverage?.applicable!==true){state='NOT_COVERED';reason='The product does not cover the requested space-time window.';}
  else if(quality?.validObservation!==true){state='OBSTRUCTED';reason=quality?.reason??'Cloud, smoke, geometry, or product quality prevents a valid observation.';}
  else if(detections.length){state='VALID_POSITIVE';reason='A valid product covered the target and produced physical detections.';}
  else{state='VALID_NEGATIVE';reason='A valid attributable product covered the target and produced no qualifying detections.';}
  return immutable({schemaVersion:'vigia.observation-opportunity.v1',state:enumValue(state,OBSERVATION_OPPORTUNITY_STATES,'invalid_observation_opportunity'),sourceId:source?.sourceId??null,geometry:structuredClone(geometry??null),timeWindow:structuredClone(timeWindow??null),productId:productAvailability?.productId??null,quality:structuredClone(quality??null),detectionCount:detections.length,reason});
}
