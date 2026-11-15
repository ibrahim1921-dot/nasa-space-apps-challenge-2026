package com.augustine.nasa_space_app_backend;

import org.springframework.boot.test.context.SpringBootTest;

/** An explicit flag alone must not authorize production capture registration. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
        "astrohealth.environment=production", "astrohealth.simulation.capture-registration-enabled=true"})
class SimulationCaptureProductionGateTests extends SimulationCaptureDisabledTests { }
