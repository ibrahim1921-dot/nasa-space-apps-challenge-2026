package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;

class AssessmentPayloadTests {
    private final ObjectMapper json=JsonMapper.builder().build();
    @Test void acceptsAllExistingFormShapesIncludingStoppedTestWithNoReadings() {
        AssessmentPayloads.validate("CHECKIN",json.readTree(AssessmentFixtures.CHECKIN));
        AssessmentPayloads.validate("SLEEP_LOG",json.readTree(AssessmentFixtures.SLEEP));
        AssessmentPayloads.validate("STAND_TEST",json.readTree(AssessmentFixtures.STAND));
        AssessmentPayloads.validate("STAND_TEST",json.readTree(AssessmentFixtures.STAND
                .replace("{\"heart_rate\":60,\"systolic\":115,\"diastolic\":75}","null")
                .replace("{\"heart_rate\":70,\"systolic\":110,\"diastolic\":70}","null")
                .replace("\"partial\":false","\"partial\":true")));
    }
    static Stream<String[]> invalid() {
        return Stream.of(
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"mood\":4","\"mood\":2.5")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"glucose\":90","\"glucose\":\"90\"")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"glucose\":90","\"glucose\":601")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"systolic\":115","\"systolic\":60")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"isolation\":2","\"isolation\":0")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"normal\"","\"extreme\"")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"today\"","\"never\"")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"crewTension\":false","\"crewTension\":\"false\"")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("Fictional test entry","x".repeat(2001))},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("\"reading\":","\"isSimulated\":true,\"reading\":")},
            new String[]{"CHECKIN",AssessmentFixtures.CHECKIN.replace("2026-11-14T12:00:00Z","not-a-time")},
            new String[]{"SLEEP_LOG",AssessmentFixtures.SLEEP.replace("2026-11-14\"","2026-02-30\"")},
            new String[]{"SLEEP_LOG",AssessmentFixtures.SLEEP.replace("\"sleep_hr_p5\":50","\"sleep_hr_p5\":61")},
            new String[]{"SLEEP_LOG",AssessmentFixtures.SLEEP.replace("\"total_sleep_h\":7.5","\"total_sleep_h\":17")},
            new String[]{"SLEEP_LOG",AssessmentFixtures.SLEEP.replace("\"rem_pct_of_sleep\":25","\"rem_pct_of_sleep\":90")},
            new String[]{"STAND_TEST",AssessmentFixtures.STAND.replace("\"dizzy\"","\"dizzy\",\"dizzy\"")},
            new String[]{"STAND_TEST",AssessmentFixtures.STAND.replace("\"dizzy\"","\"unknown\"")},
            new String[]{"STAND_TEST",AssessmentFixtures.STAND.replace("\"partial\":false","\"partial\":null")},
            new String[]{"STAND_TEST",AssessmentFixtures.STAND.replace("{\"heart_rate\":60,\"systolic\":115,\"diastolic\":75}","null")},
            new String[]{"STAND_TEST",AssessmentFixtures.STAND.replace("\"systolic\":115","\"systolic\":251")}
        );
    }
    @ParameterizedTest @MethodSource("invalid") void rejectsInvalidOrSpoofedData(String kind,String body) {
        assertThatThrownBy(()->AssessmentPayloads.validate(kind,json.readTree(body)))
                .isInstanceOf(AssessmentProblem.class).extracting("status").isEqualTo(400);
    }
}
