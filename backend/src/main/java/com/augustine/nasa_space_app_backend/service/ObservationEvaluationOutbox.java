package com.augustine.nasa_space_app_backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.UUID;

@Service
public class ObservationEvaluationOutbox {
 private final JdbcTemplate jdbc;
 private final boolean enabled;
 public ObservationEvaluationOutbox(JdbcTemplate jdbc,@Value("${astrohealth.monitoring.evaluation-enabled:false}") boolean enabled) {
  this.jdbc=jdbc; this.enabled=enabled;
 }
 /** Call only for newly inserted observations, inside the ingestion transaction. Never backfills. */
 @Transactional(propagation=Propagation.MANDATORY)
 public void enqueueNewObservation(UUID observationId) {
  if(enabled) jdbc.update("INSERT INTO health_evaluation_outbox(observation_id) VALUES (?) ON CONFLICT DO NOTHING",observationId);
 }
}
