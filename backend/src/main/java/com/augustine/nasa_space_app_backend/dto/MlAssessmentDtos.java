package com.augustine.nasa_space_app_backend.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class MlAssessmentDtos {
 private MlAssessmentDtos() { }
 public record Request(@NotNull UUID requestKey,@NotNull Instant cutoff,@NotBlank String inputMode,
                       @Size(max=100) List<@NotNull UUID> observationIds,
                       Map<String,Double> features,String unitSystem,Boolean synthetic) { }
 public record Prediction(int riskClass,String blueprintLabel,boolean classSemanticsVerified,
                          double anomalyScore,double anomalyThreshold,boolean anomaly,
                          String modelIdentifier,String modelVersion,Map<String,String> artifactSha256) { }
 public record Detail(UUID id,UUID astronautId,String executionStatus,String inferenceStatus,Instant cutoff,
                      Instant requestedAt,Instant completedAt,boolean synthetic,boolean nonclinical,
                      String disclaimer,Map<String,Object> inputSnapshot,Prediction prediction,
                      List<String> findingCodes,List<KnowledgeResponses.Countermeasure> countermeasures,
                      List<KnowledgeResponses.Card> educationalTopics) { }
 public record Summary(UUID id,UUID astronautId,String inferenceStatus,Instant requestedAt,boolean synthetic) { }
}
