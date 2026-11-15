package com.augustine.nasa_space_app_backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public allowlist; never serialize database rows or provenance/audit JSON. */
public final class HealthAlertResponses {
 private HealthAlertResponses() { }
 public record Filter(UUID astronautId,String severity,String status,String indicator,String triggerType,
                      String synthetic,Instant from,Instant to,Integer page,Integer size) { }
 public record Page(List<Summary> content,int page,int size,long totalElements,long totalPages,boolean hasNext) { }
 public record Summary(UUID id,UUID astronautId,String severity,String status,String triggerType,
  boolean synthetic,boolean nonclinical,String reason,Instant triggeredAt,Instant createdAt,
  Instant acknowledgedAt,Instant resolvedAt,List<String> indicators) { }
 public record Measurement(String metric,String unit,BigDecimal value) { }
 public record Evidence(UUID observationId,String indicator,String activityContext,UUID comparisonScopeId,
  Instant measuredAt,String sourceKind,boolean synthetic,UUID supersedesObservationId,List<Measurement> measurements) { }
 public record Rule(UUID id,int version,String indicator,String metric,String unit,String designation,
  String limitKind,BigDecimal lowerBound,BigDecimal upperBound) { }
 public record Baseline(UUID id,int version,String kind,BigDecimal referenceValue,String unit) { }
 public record Evaluation(UUID id,UUID observationId,Instant evaluatedAt,BigDecimal lowerBound,BigDecimal upperBound) { }
 public record Event(String kind,Instant occurredAt) { }
 public record Detail(Summary alert,List<Evidence> observations,Rule rule,Baseline baseline,
                      Evaluation evaluation,String resolutionNote,List<Event> history) { }
}
