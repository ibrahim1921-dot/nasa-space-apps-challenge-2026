package com.augustine.nasa_space_app_backend.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.UUID;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="astrohealth.monitoring.evaluation-enabled",havingValue="true")
public class HealthEvaluationWorker {
 private final HealthObservationEvaluator evaluator;
 private final JdbcTemplate jdbc;
 private final TransactionTemplate tx;
 public HealthEvaluationWorker(HealthObservationEvaluator evaluator,JdbcTemplate jdbc,PlatformTransactionManager manager) {
  this.evaluator=evaluator; this.jdbc=jdbc; this.tx=new TransactionTemplate(manager);
 }
 @Scheduled(fixedDelayString="${astrohealth.monitoring.poll-delay-ms:5000}",initialDelayString="${astrohealth.monitoring.initial-delay-ms:5000}")
 public void drain() {
  for(int count=0;count<100;count++) {
   try { if(!evaluator.processNext()) return; }
   catch(HealthObservationEvaluator.EvaluationFailure failure) {
    org.slf4j.LoggerFactory.getLogger(HealthEvaluationWorker.class).warn("Health evaluation job {} failed ({}); retained for retry.",
     failure.observationId(),failure.getCause().getClass().getSimpleName());
    // The failed evaluation transaction has rolled back, including alerts and evidence.
    // Defer a pending job so poison data cannot starve the queue. Never log observation contents.
    tx.executeWithoutResult(status -> {
     var jobs=jdbc.queryForList("SELECT observation_id FROM health_evaluation_outbox WHERE observation_id=? AND completed_at IS NULL FOR UPDATE SKIP LOCKED",failure.observationId());
     if(!jobs.isEmpty()) {
      UUID id=(UUID)jobs.get(0).get("observation_id");
      jdbc.update("INSERT INTO health_evaluation_failures(observation_id,reason) VALUES (?,'EVALUATION_FAILED')",id);
      jdbc.update("UPDATE health_evaluation_outbox SET attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '1 minute' WHERE observation_id=?",id);
     }
    });
    return;
   }
   catch(RuntimeException unavailable) {
    org.slf4j.LoggerFactory.getLogger(HealthEvaluationWorker.class).warn("Health evaluation queue temporarily unavailable; retrying on next poll.");
    return;
   }
  }
 }
}
