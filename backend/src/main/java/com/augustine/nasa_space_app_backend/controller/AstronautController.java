package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.AstronautProfileResponse;
import com.augustine.nasa_space_app_backend.dto.CrewProfileResponse;
import com.augustine.nasa_space_app_backend.service.AstronautService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/crew")
public class AstronautController {
    private final AstronautService astronauts;

    public AstronautController(AstronautService astronauts) { this.astronauts = astronauts; }

    @GetMapping
    public List<CrewProfileResponse> activeCrew() { return astronauts.getAllActiveAstronauts(); }

    @GetMapping("/me")
    public AstronautProfileResponse me() { return astronauts.getMyProfile(); }

    @GetMapping("/{id}")
    public AstronautProfileResponse byId(@PathVariable UUID id) { return astronauts.getAstronautById(id); }

    @GetMapping("/by-code/{crewCode}")
    public AstronautProfileResponse byCrewCode(@PathVariable String crewCode) {
        return astronauts.getAstronautByCrewCode(crewCode);
    }

    @PostMapping("/{id}/archive")
    public AstronautProfileResponse archive(@PathVariable UUID id) { return astronauts.archiveAstronaut(id); }

    @PostMapping("/{id}/reactivate")
    public AstronautProfileResponse reactivate(@PathVariable UUID id) { return astronauts.reactivateAstronaut(id); }
}
