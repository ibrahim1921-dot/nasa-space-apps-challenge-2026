package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class MlContractTests {
 @Test void rejectsMissingNonfiniteExtraInvalidMoodAndUnsupportedRanges() {
  for(String key:List.of("heart_rate","mood","radiation_mgy_day")) {
   var features=AresTestFixtures.features();features.put(key,Double.NaN);
   assertThatThrownBy(()->AresModelContract.validate(features)).isInstanceOf(MlProblem.class);
  }
  var missing=AresTestFixtures.features();missing.remove("heart_rate");assertThatThrownBy(()->AresModelContract.validate(missing)).isInstanceOf(MlProblem.class);
  var mood=AresTestFixtures.features();mood.put("mood",2.5);assertThatThrownBy(()->AresModelContract.validate(mood)).isInstanceOf(MlProblem.class);
  var sleep=AresTestFixtures.features();sleep.put("daily_sleep_hours",25.0);assertThatThrownBy(()->AresModelContract.validate(sleep)).isInstanceOf(MlProblem.class);
 }
 @Test void cumulativeRadiationRateRequiresSameOriginMonotonicValuesAndPositiveInterval() {
  Instant from=Instant.parse("2026-01-01T00:00:00Z"),to=from.plusSeconds(86400);UUID scope=UUID.randomUUID();
  assertThat(MlObservationInputs.radiationRate(new BigDecimal("1.0"),new BigDecimal("1.28"),from,to,scope,scope)).isCloseTo(0.28,within(1e-12));
  assertThat(MlObservationInputs.radiationRate(new BigDecimal("1.0"),new BigDecimal("1.14"),from,from.plusSeconds(43200),scope,scope)).isCloseTo(0.28,within(1e-12));
  assertThatThrownBy(()->MlObservationInputs.radiationRate(BigDecimal.ONE,BigDecimal.ZERO,from,to,scope,scope)).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->MlObservationInputs.radiationRate(BigDecimal.ZERO,BigDecimal.ONE,from,from,scope,scope)).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->MlObservationInputs.radiationRate(BigDecimal.ZERO,BigDecimal.ONE,from,to,scope,UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void internalEndpointRejectsPublicHostsUrlCredentialsRedirectTargetsAndUnboundedTimeouts() {
  var json=JsonMapper.builder().build();
  for(String url:List.of("http://example.com","http://127.0.0.1:18766?token=secret","http://user:pass@127.0.0.1:18766","file:///tmp/model","http://127.0.0.1:18766/other"))
   assertThatThrownBy(()->new MlInferenceClient(json,url,"x".repeat(32),1000,5000)).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->new MlInferenceClient(json,"http://127.0.0.1:18766","x".repeat(32),1000,60000)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void absentServiceTokenFailsClosedWithoutMakingARequest() {
  var client=new MlInferenceClient(JsonMapper.builder().build(),"http://127.0.0.1:1","",100,100);
  assertThatThrownBy(()->client.assess(AresTestFixtures.features())).isInstanceOf(MlProblem.class).hasMessage("MODEL_SERVICE_UNAVAILABLE");
 }
}
