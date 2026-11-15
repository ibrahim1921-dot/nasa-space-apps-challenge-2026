package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.service.AresModelContract;
import java.util.*;

/** Mock output only. Real predictions are exercised separately by MlTrainedModelTests. */
final class AresTestFixtures {
 static Map<String,Double> features() {
  double[] values={115,75,98,85,36.8,5.2,2,42.5,0,0.28};var m=new TreeMap<String,Double>();
  for(int i=0;i<values.length;i++)m.put(AresModelContract.FEATURES.get(i),values[i]);return m;
 }
 static Map<String,Object> result() {
  var result=new LinkedHashMap<String,Object>();
  result.put("schema_version","astrohealth.ares.result.v1");result.put("inference_status","SUCCEEDED");
  result.put("risk_class",1);result.put("risk_label",null);result.put("blueprint_label","Warning");
  result.put("risk_probabilities",Map.of("0",0.1,"1",0.8,"2",0.1));result.put("anomaly_score",0.5);
  result.put("anomaly_threshold",AresModelContract.THRESHOLD);result.put("is_anomaly",true);
  result.put("synthetic",true);result.put("nonclinical",true);
  result.put("model",Map.of("identifier",AresModelContract.ID,"version",AresModelContract.VERSION,"artifact_sha256",AresModelContract.HASHES,
   "feature_order",AresModelContract.FEATURES,"classifier_classes",List.of(0,1,2),"class_semantics_verified",false,"input_contract_verified",false));return result;
 }
}
