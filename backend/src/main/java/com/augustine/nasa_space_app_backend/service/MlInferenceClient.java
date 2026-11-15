package com.augustine.nasa_space_app_backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;

@Component
public class MlInferenceClient {
 private final ObjectMapper json;
 private final URI endpoint;
 private final String token;
 private final long timeoutMs;
 private final HttpClient client;
 public MlInferenceClient(ObjectMapper json,
  @Value("${astrohealth.ml.endpoint:http://127.0.0.1:18766}") String endpoint,
  @Value("${astrohealth.ml.token:}") String token,
  @Value("${astrohealth.ml.connect-timeout-ms:1000}") long connectMs,
  @Value("${astrohealth.ml.request-timeout-ms:5000}") long timeoutMs) {
  this.json=json;this.token=token;this.timeoutMs=timeoutMs;
  URI uri=URI.create(endpoint);
  if(uri.getHost()==null || uri.getScheme()==null || !Set.of("127.0.0.1","[::1]","::1").contains(uri.getHost()) || !Set.of("http","https").contains(uri.getScheme())
    || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))
    || connectMs<100 || connectMs>10000 || timeoutMs<100 || timeoutMs>30000) throw new IllegalArgumentException("Invalid internal ML endpoint or timeout configuration");
  this.endpoint=uri.resolve("/api/v1/diagnostics/assess");
  this.client=HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectMs)).followRedirects(HttpClient.Redirect.NEVER).build();
 }
 public JsonNode assess(Map<String,Double> features) {
  if(token.length()<32) throw new MlProblem(503,"MODEL_SERVICE_UNAVAILABLE");
  Map<String,Object> wireFeatures=new TreeMap<>(features);
  // Java's numeric input map stores doubles; the Python contract requires JSON integer mood.
  wireFeatures.put("mood",features.get("mood").intValue());
  String body=json.writeValueAsString(Map.of("input_mode","EXPLICIT_SYNTHETIC_VECTOR","synthetic",true,
   "unit_system","BLUEPRINT_NATIVE_UNVERIFIED","features",wireFeatures));
  var request=HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(timeoutMs)).header("Content-Type","application/json")
   .header("Authorization","Bearer "+token).POST(HttpRequest.BodyPublishers.ofString(body)).build();
  CompletableFuture<HttpResponse<byte[]>> pending=client.sendAsync(request,info->new BoundedBody());
  try {
   var response=pending.get(timeoutMs,TimeUnit.MILLISECONDS);
   if(response.statusCode()!=200) throw new MlProblem(503,"MODEL_SERVICE_UNAVAILABLE");
   JsonNode result=json.readTree(response.body());validate(result);return result;
  } catch(MlProblem e) {throw e;}
  catch(InterruptedException e) {Thread.currentThread().interrupt();throw new MlProblem(503,"MODEL_SERVICE_UNAVAILABLE");}
  catch(Exception e) {throw new MlProblem(503,"MODEL_SERVICE_UNAVAILABLE");}
  finally {pending.cancel(true);}
 }
 private void validate(JsonNode r) {
  try {
   var model=r.required("model");
   if(!r.path("schema_version").asText().equals("astrohealth.ares.result.v1") || !r.path("inference_status").asText().equals("SUCCEEDED")
     || !r.path("synthetic").isBoolean() || !r.path("synthetic").asBoolean() || !r.path("nonclinical").isBoolean() || !r.path("nonclinical").asBoolean()
     || !model.path("identifier").asText().equals(AresModelContract.ID) || !model.path("version").asText().equals(AresModelContract.VERSION)
     || !model.path("artifact_sha256").equals(json.valueToTree(AresModelContract.HASHES))
     || !model.path("feature_order").equals(json.valueToTree(AresModelContract.FEATURES))
     || !model.path("classifier_classes").equals(json.valueToTree(List.of(0,1,2)))
     || !model.path("class_semantics_verified").isBoolean() || model.path("class_semantics_verified").asBoolean()
     || !model.path("input_contract_verified").isBoolean() || model.path("input_contract_verified").asBoolean()) invalid();
   if(!r.path("risk_class").isIntegralNumber() || !r.path("risk_class").canConvertToInt() || !Set.of(0,1,2).contains(r.path("risk_class").asInt()) || !r.path("risk_label").isNull()) invalid();
   int risk=r.path("risk_class").asInt();
   if(!r.path("blueprint_label").asText().equals(List.of("Optimal","Warning","Critical").get(risk))) invalid();
   double score=number(r,"anomaly_score"), threshold=number(r,"anomaly_threshold");
   if(score<0 || threshold!=AresModelContract.THRESHOLD || !r.path("is_anomaly").isBoolean() || r.path("is_anomaly").asBoolean()!=(score>threshold)) invalid();
   JsonNode probabilities=r.path("risk_probabilities");
   if(!probabilities.isObject() || probabilities.size()!=3) invalid();
   double sum=0;for(String c:List.of("0","1","2")) {double p=number(probabilities,c);if(p<0||p>1)invalid();sum+=p;}
   if(Math.abs(sum-1)>1e-6)invalid();
  } catch(MlProblem e) {throw e;} catch(Exception e) {invalid();}
 }
 private double number(JsonNode r,String key) {
  JsonNode n=r.path(key);if(!n.isNumber() || !Double.isFinite(n.asDouble()))invalid();return n.asDouble();
 }
 private void invalid() {throw new MlProblem(503,"INVALID_MODEL_RESPONSE");}
 private static class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
  final HttpResponse.BodySubscriber<byte[]> delegate=HttpResponse.BodySubscribers.ofByteArray();
  Flow.Subscription subscription;int received;
  public CompletionStage<byte[]> getBody(){return delegate.getBody();}
  public void onSubscribe(Flow.Subscription s){subscription=s;delegate.onSubscribe(s);}
  public void onNext(List<ByteBuffer> chunks){
   for(var chunk:chunks)received+=chunk.remaining();
   if(received>65536){subscription.cancel();delegate.onError(new IllegalStateException("Response too large"));}else delegate.onNext(chunks);
  }
  public void onError(Throwable error){delegate.onError(error);}
  public void onComplete(){delegate.onComplete();}
 }
}
