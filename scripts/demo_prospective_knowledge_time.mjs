import { runProspectiveKnowledgeTimeDemo } from '../apps/api/src/modules/decision-foundry/learning-service.mjs';

const report = await runProspectiveKnowledgeTimeDemo({ projectRoot: process.cwd() }); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
