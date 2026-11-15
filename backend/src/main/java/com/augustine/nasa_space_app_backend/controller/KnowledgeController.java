package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.KnowledgeResponses.*;
import com.augustine.nasa_space_app_backend.service.KnowledgeService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
 private final KnowledgeService service;
 public KnowledgeController(KnowledgeService service) {this.service=service;}
 @GetMapping("/topics") public List<Card> topics() {return service.topics();}
 @GetMapping("/topics/{code}") public Topic topic(@PathVariable String code) {return service.topic(code);}
 @GetMapping("/topics/{code}/sections") public List<Section> sections(@PathVariable String code) {return service.sections(code);}
 @GetMapping("/topics/{code}/sections/{kind}") public Section section(@PathVariable String code,@PathVariable String kind) {return service.section(code,kind);}
 @GetMapping("/countermeasures") public List<Countermeasure> countermeasures(@RequestParam(required=false) String indicator,@RequestParam(required=false) String finding) {return service.countermeasures(indicator,finding);}
 @GetMapping("/countermeasures/{code}") public Countermeasure countermeasure(@PathVariable String code) {return service.countermeasure(code);}
 @GetMapping("/findings") public List<Finding> findings() {return service.findings();}
}
