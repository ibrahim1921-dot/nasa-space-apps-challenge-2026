package com.augustine.nasa_space_app_backend.service;

import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.cfg.JsonNodeFeature;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.TreeSet;

/** Versioned canonical JSON; independent of object insertion order, whitespace and number spelling. */
public final class SimulationPayload {
    public static final int MAX_BYTES = 1_048_576;
    public static final String VERSION = "astrohealth.simulation.canonical.v1";
    private static final JsonMapper JSON = JsonMapper.builder(JsonFactory.builder()
                    .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32)
                            .maxNumberLength(128).maxStringLength(65536).build()).build())
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(JsonNodeFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
    private SimulationPayload() { }

    public static JsonNode parse(byte[] bytes) {
        if (bytes == null || bytes.length > MAX_BYTES) throw new SimulationIngestionException(413, "payload_too_large");
        try {
            JsonNode node = JSON.readTree(bytes);
            if (node == null || !node.isObject()) throw invalid();
            return node;
        } catch (SimulationIngestionException exception) { throw exception; }
        catch (RuntimeException exception) { throw invalid(); }
    }

    public static String canonical(JsonNode node) {
        if (node == null || node.isNull()) return "null";
        if (node.isObject()) {
            var result = new StringBuilder("{");
            for (String key : new TreeSet<>(node.propertyNames())) {
                if (result.length() > 1) result.append(',');
                result.append(JSON.writeValueAsString(key)).append(':').append(canonical(node.get(key)));
            }
            return result.append('}').toString();
        }
        if (node.isArray()) {
            var result = new StringBuilder("[");
            for (var child : node) {
                if (result.length() > 1) result.append(',');
                result.append(canonical(child));
            }
            return result.append(']').toString();
        }
        if (node.isNumber()) {
            BigDecimal number;
            try { number = node.decimalValue().stripTrailingZeros(); } catch (RuntimeException exception) { throw invalid(); }
            // Bound exponent expansion as well as the original JSON number length.
            if (Math.abs((long) number.scale()) > 128 || number.precision() > 128) throw invalid();
            return number.signum() == 0 ? "0" : number.toPlainString();
        }
        if (node.isTextual() || node.isBoolean()) return JSON.writeValueAsString(node);
        throw invalid();
    }

    public static String hash(JsonNode envelope, String captureId, String workspaceId, String mappingId, long sequence) {
        // Fixed framing fields cannot contain newlines; the complete original envelope follows.
        String content = VERSION + "\n" + captureId + "\n" + workspaceId + "\n" + mappingId + "\n" + sequence + "\n" + canonical(envelope);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    static SimulationIngestionException invalid() { return new SimulationIngestionException(400, "invalid_observation"); }
}
