package com.augustine.nasa_space_app_backend.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Read-only selection contract. Bounds are inclusive; this interface never emits alerts. */
public interface MonitoringRuleResolver {
 record Resolution(String status, UUID ruleId, Integer version, String severity, String designation,
                   BigDecimal lowerBound, BigDecimal upperBound, UUID baselineId) { }
 Resolution resolve(UUID astronautId, String indicator, String metric, String unit,
                    String context, UUID scope, Instant at);
}
