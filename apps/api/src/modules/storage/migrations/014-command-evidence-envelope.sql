ALTER TABLE incident_command_event ADD COLUMN IF NOT EXISTS event_envelope jsonb;
ALTER TABLE incident_command_event ADD COLUMN IF NOT EXISTS envelope_hash text;

UPDATE incident_command_event
SET event_envelope=jsonb_build_object(
  'schemaVersion','vigia.incident-command-event.v1',
  'eventId',event_id,
  'incidentId',incident_id,
  'type',event_type,
  'payload',payload,
  'exercise',exercise,
  'source',source,
  'author',actor_id,
  'observedAt',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'receivedAt',to_char(received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'lastUpdatedAt',to_char(received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'verificationState','LEGACY_ENVELOPE_BACKFILL',
  'confidence',NULL,
  'uncertainty',NULL,
  'responsibleOwner',actor_id,
  'scope',NULL,
  'reviewAt',NULL,
  'expiresAt',NULL,
  'releaseId',release_id,
  'auditReference',NULL
)
WHERE event_envelope IS NULL;

ALTER TABLE incident_command_event ALTER COLUMN event_envelope SET NOT NULL;
CREATE INDEX IF NOT EXISTS incident_command_event_owner_idx ON incident_command_event((event_envelope->>'responsibleOwner'),received_at DESC);
CREATE INDEX IF NOT EXISTS incident_command_event_review_idx ON incident_command_event((event_envelope->>'reviewAt')) WHERE event_envelope->>'reviewAt' IS NOT NULL;
