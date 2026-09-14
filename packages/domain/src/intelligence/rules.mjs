import { hashValue } from './contract.mjs';

const registry = [
  ['SIT-001','Current physical observations from two governed source families support a multi-family state',['incident.observations','freshness'],['CURRENT_PHYSICAL','TWO_SOURCE_FAMILIES'],'MULTI_FAMILY_PHYSICAL_SUPPORT',['STALE','SOURCE_STATUS_ONLY']],
  ['SIT-002','One governed current physical family remains uncorroborated',['incident.observations','freshness'],['CURRENT_PHYSICAL','ONE_SOURCE_FAMILY'],'SINGLE_FAMILY_PHYSICAL_SIGNAL',['REPORT_IDS_DO_NOT_CREATE_INDEPENDENCE']],
  ['SIT-003','A current report without current physical evidence remains report-only',['incident.observations'],['CURRENT_REPORT','NO_CURRENT_PHYSICAL'],'REPORT_ONLY_INCIDENT',['SOURCE_AVAILABILITY']],
  ['SIT-004','Contradictory attributable evidence is explicit',['evidence.contradictions'],['ATTRIBUTABLE_CONTRADICTION'],'PHYSICAL_REPORT_CONFLICT',['UNATTRIBUTABLE_TEXT']],
  ['SIT-005','Stale physical observations do not support a current claim',['incident.observations','freshness'],['PHYSICAL_PRESENT','NO_CURRENT_PHYSICAL'],'STALE_PHYSICAL_EVIDENCE',['CURRENT_REPORT_AS_PHYSICAL']],
  ['ATT-001','Life-safety relevance precedes other attention factors',['incident.lifeSafetyRelevance'],['GOVERNED_FLAG'],'LIFE_SAFETY_RELEVANCE',['RECORD_COUNT']],
  ['ATT-002','Decision-blocking unknowns precede contextual gaps',['unknown.classification'],['DECISION_BLOCKING'],'UNRESOLVED_DECISION_IMPACT',['UNPRIORITIZED_UNKNOWN']],
  ['UNK-001','Missing independent corroboration can block a stronger physical claim',['situation.state'],['SINGLE_FAMILY_PHYSICAL_SIGNAL'],'DECISION_BLOCKING',['SOURCE_ID_COUNT']],
  ['NBE-001','Only attributable eligible opportunities may be ranked',['opportunity'],['AUTHORITY','COVERAGE_OR_ASSET','AVAILABILITY'],'ELIGIBLE_EVIDENCE_OPTION',['POLL_CADENCE_ONLY','UNCONFIGURED_ASSET']],
  ['PAS-001','Negative outcomes require a qualifying opportunity and coverage contract',['opportunity','outcome'],['QUALIFYING_OPPORTUNITY','VALID_COVERAGE'],'MEASURED_NEGATIVE',['NO_OPPORTUNITY']],
  ['TDT-001','Unreached TDT stages remain null',['incident.timeline'],['ATTRIBUTABLE_TIMESTAMP'],'TDT_STAGE',['INFERRED_ZERO']],
  ['DEL-001','Projection recomputation is distinct from external facts and human decisions',['previous','current'],['CHANGE_PROVENANCE'],'DECISION_DELTA',['COPY_ONLY_CHANGE']],
  ['REP-001','Replay excludes evidence not visible at the governed clock',['evidence.visibleAt','asOf'],['VISIBLE_AT_OR_BEFORE_CLOCK'],'HINDSIGHT_SAFE_INPUT',['FUTURE_RECORD']],
  ['SEC-001','Clients cannot select rules, attention tiers, passports, or TDT stages',['server_projection'],['SERVER_OWNED_RULES'],'SERVER_OWNED_OUTPUT',['CLIENT_SELECTED_RESULT']],
  ['SEC-002','Snapshot identity covers every normalized decision-driving input and the governed clock bucket',['incident','needs','requests','opportunities','results','source_state','decisions','fieldnet','corrections','clock_bucket'],['COMPLETE_NORMALIZED_INPUT_DOCUMENT'],'IMMUTABLE_INPUT_STATE_HASH',['PARTIAL_FIELD_HASH']]
].map(([ruleId,description,inputs,preconditions,outputState,exclusions])=>Object.freeze({ruleId,version:'1',description,inputs:Object.freeze(inputs),preconditions:Object.freeze(preconditions),outputState,exclusions:Object.freeze(exclusions),authority:'VIGIA Crisis Ontology V1',testReferences:Object.freeze([`packages/domain/test/intelligence-fabric.test.mjs#${ruleId}`])}));

export const INTELLIGENCE_RULES = Object.freeze(registry);
export const RULE_SET_VERSION = `vigia.intelligence-rules.v1:${hashValue(registry).slice(7,23)}`;
export function ruleById(id){return INTELLIGENCE_RULES.find((rule)=>rule.ruleId===id)??null;}
