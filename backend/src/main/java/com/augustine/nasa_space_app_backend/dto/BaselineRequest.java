package com.augustine.nasa_space_app_backend.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Reference values only; no clinical bounds or simulation configuration accepted. */
public record BaselineRequest(
        @NotBlank String indicatorCode, @NotBlank String metricCode, @NotBlank String unit,
        @NotBlank String activityContext, @NotNull UUID comparisonScopeId,
        @Pattern(regexp = "ORIGINAL|ROLLING") @NotNull String baselineKind,
        @NotNull @Digits(integer = 12, fraction = 6) BigDecimal referenceValue,
        @NotNull Instant effectiveFrom, Instant effectiveTo,
        @NotNull Instant inputFrom, @NotNull Instant inputTo,
        @NotBlank @Size(max = 1000) String method, @NotBlank @Size(max = 200) String sourceName,
        @NotEmpty @Size(max = 1000) List<@NotNull UUID> observationIds,
        UUID supersedesBaselineId, @Size(max = 2000) String correctionReason) { }
