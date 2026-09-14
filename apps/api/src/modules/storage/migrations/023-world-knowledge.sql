CREATE TABLE IF NOT EXISTS world_knowledge_entity (
 id text PRIMARY KEY, payload jsonb NOT NULL, geometry geometry(Point,4326), updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS world_knowledge_entity_geo ON world_knowledge_entity USING gist(geometry);
CREATE INDEX IF NOT EXISTS world_knowledge_entity_type ON world_knowledge_entity ((payload->>'canonicalType'));
CREATE INDEX IF NOT EXISTS world_knowledge_entity_external ON world_knowledge_entity USING gin((payload->'externalIds'));
CREATE TABLE IF NOT EXISTS world_knowledge_document (
 id text PRIMARY KEY, source_url text NOT NULL, content_hash text NOT NULL, payload jsonb NOT NULL, retrieved_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS world_knowledge_document_source ON world_knowledge_document(source_url,retrieved_at DESC);
CREATE TABLE IF NOT EXISTS world_knowledge_fact (
 id text PRIMARY KEY, entity_id text NOT NULL REFERENCES world_knowledge_entity(id), document_id text NOT NULL REFERENCES world_knowledge_document(id), predicate text NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS world_knowledge_fact_subject ON world_knowledge_fact(entity_id,predicate);
CREATE TABLE IF NOT EXISTS world_knowledge_job (
 id text PRIMARY KEY, payload jsonb NOT NULL, state text NOT NULL, priority integer NOT NULL DEFAULT 0, due_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS world_knowledge_job_due ON world_knowledge_job(state,due_at,priority DESC);
CREATE TABLE IF NOT EXISTS world_knowledge_relation (
 id text PRIMARY KEY, incident_id text NOT NULL, entity_id text REFERENCES world_knowledge_entity(id), payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS world_knowledge_relation_incident ON world_knowledge_relation(incident_id);
CREATE TABLE IF NOT EXISTS world_knowledge_source (
 id text PRIMARY KEY, payload jsonb NOT NULL
);
