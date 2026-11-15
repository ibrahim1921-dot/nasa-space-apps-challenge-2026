package com.augustine.nasa_space_app_backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import jakarta.validation.constraints.*;

public record MonitoringRuleRequest(
 @NotBlank @Size(max=120) String ruleCode, UUID astronautId,
 @NotBlank String indicatorCode, @NotBlank String metricCode, @NotBlank String unit,
 @NotBlank String activityContext, @NotNull UUID comparisonScopeId,
 BigDecimal lowerBound, BigDecimal upperBound,
 @NotBlank String limitKind, @NotBlank String severity, @NotBlank String designation,
 @NotNull Instant validFrom, Instant validTo,
 @NotBlank @Size(max=2000) String sourceName,
 @NotBlank @Size(max=2000) String sourceReference,
 @NotBlank @Size(max=2000) String rationale,
 @NotBlank @Size(max=2000) String approvalNote) { }
