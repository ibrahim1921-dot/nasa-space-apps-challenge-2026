package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/crew/{astronautId}")
public class AstronautAssessmentController {
    private final AstronautAssessmentService assessments;
    public AstronautAssessmentController(AstronautAssessmentService assessments) { this.assessments=assessments; }

    @PostMapping({"/checkins","/sleep-logs","/stand-tests"})
    public ResponseEntity<AstronautAssessmentService.Submission> submit(@PathVariable UUID astronautId,
            @RequestHeader("Idempotency-Key") UUID key,@RequestBody JsonNode body,jakarta.servlet.http.HttpServletRequest request) {
        String resource=resource(request);
        var saved=assessments.submit(astronautId,kind(resource),key,body);
        return ResponseEntity.status(saved.created()?201:200)
                .location(URI.create("/api/crew/"+astronautId+"/"+resource+"/"+saved.submission().id()))
                .body(saved.submission());
    }
    @GetMapping({"/checkins","/sleep-logs","/stand-tests"})
    public AstronautAssessmentService.History history(@PathVariable UUID astronautId,
            @RequestParam(defaultValue="20") int limit,@RequestParam(required=false) UUID before,
            jakarta.servlet.http.HttpServletRequest request) {
        return assessments.history(astronautId,kind(resource(request)),limit,before);
    }
    @GetMapping({"/checkins/{submissionId}","/sleep-logs/{submissionId}","/stand-tests/{submissionId}"})
    public AstronautAssessmentService.Submission get(@PathVariable UUID astronautId,@PathVariable UUID submissionId,
            jakarta.servlet.http.HttpServletRequest request) {
        String[] parts=request.getRequestURI().split("/");
        return assessments.get(astronautId,kind(parts[parts.length-2]),submissionId);
    }
    private static String resource(jakarta.servlet.http.HttpServletRequest r) {
        String path=r.getRequestURI(); return path.substring(path.lastIndexOf('/')+1);
    }
    private static String kind(String resource) {
        return switch(resource) { case "checkins" -> "CHECKIN"; case "sleep-logs" -> "SLEEP_LOG";
            case "stand-tests" -> "STAND_TEST"; default -> throw new AssessmentProblem(404,"Assessment type not found."); };
    }
}
