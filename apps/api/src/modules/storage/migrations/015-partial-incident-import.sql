ALTER TABLE incident_command_import
  DROP CONSTRAINT IF EXISTS incident_command_import_status_check;

ALTER TABLE incident_command_import
  ADD CONSTRAINT incident_command_import_status_check
  CHECK (status IN ('ACCEPTED','PARTIALLY_ACCEPTED','REJECTED'));
