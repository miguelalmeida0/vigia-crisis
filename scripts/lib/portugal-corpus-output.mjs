import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIRMS_NORMALIZER_VERSION } from '../../apps/api/src/modules/world/firms-normalizer.mjs';

export function sourceManifest(rawProducts) {
  return {
    schemaVersion:'vigia-replay-source-manifest.v1',id:'portugal-2024-official-evidence',countryCode:'PT',
    period:{start:'2024-01-01T00:00:00.000Z',end:'2024-12-31T23:59:59.999Z'},
    products:rawProducts.map(({payload,...product})=>product),
    licencesAndTerms:[
      {provider:'NASA FIRMS',state:'provider_terms_apply',url:'https://firms.modaps.eosdis.nasa.gov/content/acknowledgements'},
      {provider:'api.ptdata.org / ICNF SGIF',state:'provider_terms_apply',url:'https://api.ptdata.org/docs'}
    ],
    limitations:[
      'The annual FIRMS country files retain observation time but not the exact time each row became available to an operator.',
      'The ICNF SGIF archive is an official fire-report reference; alert coordinates and times are not pixel-level ignition truth.',
      'Corpus selection requires burned area >=500 ha, at least three assigned VIIRS observations, and one observation within 2.8 km of the report coordinate.',
      'Each thermal detection is assigned to at most one official report using distance first and time separation second.',
      'Derived replay records retain up to 12 points per satellite pass for the baseline split and a minimum representative set (normally 6 spatial/FRP extrema) for added splits; unchanged source files remain archived.'
    ]
  };
}

export function corpusDataset({ root, manifestOutput, manifest, cases, records }) {
  return {
    schemaVersion:'vigia-portugal-operational-replay.v2',
    metadata:{
      id:manifest.id,countryCode:'PT',evidenceClass:'official_archival_evidence',sourceManifest:path.relative(root,manifestOutput),
      caseSelectionPolicy:'2024 ICNF SGIF reports >=500 ha; unique nearest-report assignment for 3+ VIIRS vegetation-fire observations within 12 km and report lifecycle window; nearest observation <=2.8 km; all 35 qualifying cases retained and governed as baseline-comparable, development, or held-out splits.',
      evaluationPolicy:'The original top 15 cases remain the baseline-comparable split. Cases 16-25 are development; cases 26-35 are held out from association-engine tuning.',
      replayThinningPolicy:'The 15 baseline-comparable cases retain at most 12 observations per platform/pass. Added development and held-out cases retain at most 4. Both preserve nearest-report, maximum-FRP, coordinate extremes and distributed samples; raw archives are unchanged.',
      controlledClock:true,futureEvidencePolicy:'A record becomes visible only when replay clock >= record.arrivalAt.',
      arrivalTimeQualification:'Replay arrivalAt equals source observation/report event time because annual archives do not preserve original delivery timestamps.',
      productionNormalizers:[FIRMS_NORMALIZER_VERSION,'ptdata-normalizers-v2'],generatedAt:new Date().toISOString()
    },
    cases,records
  };
}

export async function writeCorpus({ output, manifestOutput, manifest, dataset }) {
  await Promise.all([writeFile(manifestOutput,`${JSON.stringify(manifest,null,2)}\n`),writeFile(output,`${JSON.stringify(dataset,null,2)}\n`)]);
}
