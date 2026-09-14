# Audit export runbook

After handoff and period closure, export the operational-period audit bundle from `/api/v10/operator/operational-periods/:periodId/audit-bundle`. Verify the period, objectives, tactics, assignments, resources, decisions, actions, acknowledgements, protection item, postconditions, outcomes, handoff, after-action package, fingerprints, and release quartet.

Store the export in the release evidence directory. Do not alter IDs or timestamps. Hash the artifact, classify it as generated evidence, and confirm no secret material is present. An export with a different release quartet cannot certify the running release.
