import { json } from './postgres-alert-store-support.mjs';

export async function seedRoster({tx},{actors=[],assignments=[]}={}){
  return tx(async(client)=>{
    for(const actor of actors)await client.query(`INSERT INTO operations_actor_roster(actor_id,display_name,actor_role,availability,channels,identity_scope,source,provenance,shift_start,shift_end,active)
      VALUES($1,$2,$3,$4,$5::jsonb,'SHADOW',$6,$7::jsonb,$8,$9,$10)
      ON CONFLICT(actor_id) DO UPDATE SET display_name=excluded.display_name,actor_role=excluded.actor_role,availability=excluded.availability,channels=excluded.channels,source=excluded.source,provenance=excluded.provenance,shift_start=excluded.shift_start,shift_end=excluded.shift_end,active=excluded.active,updated_at=now()`,
    [actor.actorId,actor.displayName,actor.actorRole,actor.availability,json(actor.channels),actor.source,json(actor.provenance),actor.shiftStart,actor.shiftEnd,actor.active!==false]);
    for(const assignment of assignments)await client.query(`INSERT INTO operations_territory_assignment(territory_id,actor_id,assignment_role,escalation_level,active)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(territory_id,actor_id,escalation_level) DO UPDATE SET assignment_role=excluded.assignment_role,active=excluded.active,updated_at=now()`,
    [assignment.territoryId,assignment.actorId,assignment.assignmentRole,assignment.escalationLevel??0,assignment.active!==false]);
    return{actorCount:actors.length,assignmentCount:assignments.length};
  });
}
export async function listRoster({pool},{territoryId=null}={}){
  const result=await pool.query(`SELECT r.actor_id,r.display_name,r.actor_role,r.availability,r.channels,r.identity_scope,r.source,r.provenance,r.shift_start,r.shift_end,r.active,
    COALESCE(jsonb_agg(jsonb_build_object('territoryId',a.territory_id,'assignmentRole',a.assignment_role,'escalationLevel',a.escalation_level,'active',a.active) ORDER BY a.escalation_level) FILTER (WHERE a.actor_id IS NOT NULL),'[]'::jsonb) assignments
    FROM operations_actor_roster r LEFT JOIN operations_territory_assignment a ON a.actor_id=r.actor_id AND ($1::text IS NULL OR a.territory_id=$1)
    WHERE r.active GROUP BY r.actor_id ORDER BY r.actor_role,r.display_name`,[territoryId]);
  return result.rows.map((row)=>({actorId:row.actor_id,displayName:row.display_name,actorRole:row.actor_role,availability:row.availability,channels:row.channels,identityScope:row.identity_scope,source:row.source,provenance:row.provenance,shiftStart:row.shift_start,shiftEnd:row.shift_end,active:row.active,assignments:row.assignments}));
}
export async function operationsStatus(pool){
  const[alerts,outbox,opportunities,results,audit,roster]=await Promise.all([
    pool.query(`SELECT lifecycle_state,count(*)::int count FROM operational_alert GROUP BY lifecycle_state`),pool.query(`SELECT state,count(*)::int count FROM alert_delivery_outbox GROUP BY state`),
    pool.query(`SELECT opportunity_type,count(*)::int count FROM operational_observation_opportunity WHERE expires_at>now() GROUP BY opportunity_type`),pool.query(`SELECT result_state,count(*)::int count FROM evidence_opportunity_result GROUP BY result_state`),
    pool.query(`SELECT count(*)::int count,max(sequence)::bigint head_sequence,max(created_at) last_append_at FROM operations_audit_record`),pool.query(`SELECT availability,count(*)::int count FROM operations_actor_roster WHERE active GROUP BY availability`)]);
  const map=(rows,key)=>Object.fromEntries(rows.map((row)=>[row[key],row.count])),pending=['PENDING','ATTEMPTING','RETRY_WAIT'].reduce((sum,state)=>sum+(outbox.rows.find((row)=>row.state===state)?.count??0),0);
  return{alerts:map(alerts.rows,'lifecycle_state'),outbox:{states:map(outbox.rows,'state'),backlog:pending},opportunities:map(opportunities.rows,'opportunity_type'),opportunityResults:map(results.rows,'result_state'),audit:{count:audit.rows[0]?.count??0,headSequence:Number(audit.rows[0]?.head_sequence??0),lastAppendAt:audit.rows[0]?.last_append_at??null},roster:map(roster.rows,'availability')};
}
