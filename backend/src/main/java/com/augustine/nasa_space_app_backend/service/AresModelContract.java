package com.augustine.nasa_space_app_backend.service;

import java.util.*;

/** Hashes pin the explicitly trusted teammate bundle; Java never deserializes model files. */
public final class AresModelContract {
 private AresModelContract() { }
 public static final String ID="ares-dual-engine";
 public static final String VERSION="63493898feb45ad54be38928c14c64f4656fd4276bc2dc1b871e5fe766e6fdfb";
 public static final double THRESHOLD=0.3713613787649183;
 public static final List<String> FEATURES=List.of("systolic_bp","diastolic_bp","heart_rate","blood_sugar","body_temperature","daily_sleep_hours","mood","muscle_strength_kg","bone_density_t_score","radiation_mgy_day");
 public static final Map<String,String> HASHES=Map.of(
  "astronaut_rf_model.pkl","a1adf079423f2ab159139ffbf3a14bf1c146132ee07283ae9c7c29ba4838a8cb",
  "astronaut_scaler.pkl","3ee65642e64ec77aaa66b7326fb67941fe980e90d71826beddff56d51cb1fd60",
  "astronaut_config.pkl","4631aa763e90c74f139b06f3c7db6e85fdc4c49947d49ea8117670afb13f89e1",
  "astronaut_autoencoder.keras.zip","f816ab9dc950d31e5379720aab09af995258c08c5df9b704af32ff8321104eb0");
 // Context education only. No mapping from risk classes or invented medical thresholds.
 // Grip, T-score and daily-dose features deliberately do not map to incompatible catalog metrics.
 public static final List<String> CONTEXT_FINDINGS=List.of("blood-pressure-systolic-context","blood-pressure-diastolic-context",
  "heart-rate-value-context","blood-sugar-value-context","body-temperature-value-context","sleep-hours-duration-context","mood-score-context");
 public static Map<String,Double> validate(Map<String,Double> input) {
  if(input==null || !input.keySet().equals(new HashSet<>(FEATURES))) throw new MlProblem(400,"INVALID_FEATURES");
  double[] lower={0,0,0,0,0,0,1,0,-20,0};
  double[] upper={500,500,400,2000,60,24,5,1000,20,1000000};
  for(int i=0;i<FEATURES.size();i++) {
   Double value=input.get(FEATURES.get(i));
   if(value==null || !Double.isFinite(value) || value<lower[i] || value>upper[i] || (i<5 && value==0)) throw new MlProblem(400,"INVALID_FEATURES");
  }
  if(input.get("mood")!=Math.rint(input.get("mood")) || input.get("systolic_bp")<input.get("diastolic_bp")) throw new MlProblem(400,"INVALID_FEATURES");
  return Collections.unmodifiableMap(new TreeMap<>(input));
 }
}
