package com.augustine.nasa_space_app_backend.service;

import java.util.Map;

/** Only fixed public codes/messages and an approved scope descriptor may cross this boundary. */
public class SimulationIngestionException extends RuntimeException {
    private final int status;
    private final String code;
    private final Map<String, Object> requiredScope;
    public SimulationIngestionException(int status, String code) { this(status, code, Map.of()); }
    public SimulationIngestionException(int status, String code, Map<String, Object> requiredScope) {
        super(code);
        this.status = status;
        this.code = code;
        this.requiredScope = Map.copyOf(requiredScope);
    }
    public int status() { return status; }
    public String code() { return code; }
    public Map<String, Object> requiredScope() { return requiredScope; }
}
