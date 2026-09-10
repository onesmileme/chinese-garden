package com.childedu.chinese.operations.api;

import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.application.RawContentImportService;
import com.childedu.chinese.operations.application.RawContentImportService.RawCandidate;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/content-imports")
public class ContentImportController {

  private final RawContentImportService service;
  private final ObjectMapper objectMapper;

  public ContentImportController(RawContentImportService service, ObjectMapper objectMapper) {
    this.service = service;
    this.objectMapper = objectMapper;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public RawContentImportService.BatchView createBatch(
      @RequestBody Map<String, Object> request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    new AdminPrincipal(actor, roles, true).require(AdminRole.EDITOR);
    String ruleVersion = (String) request.get("ruleVersion");
    return service.createBatch(ruleVersion, request, actor, Instant.now());
  }

  @PostMapping("/{id}/candidates")
  public RawContentImportService.AppendResult appendCandidates(
      @PathVariable String id,
      @RequestBody List<RawCandidate> candidates,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    new AdminPrincipal(actor, roles, true).require(AdminRole.EDITOR);
    return service.appendCandidates(id, candidates, actor, Instant.now());
  }

  @PostMapping("/{id}/complete")
  public RawContentImportService.BatchView completeBatch(
      @PathVariable String id,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    new AdminPrincipal(actor, roles, true).require(AdminRole.EDITOR);
    return service.completeBatch(id, actor, Instant.now());
  }

  @GetMapping("/{id}")
  public RawContentImportService.BatchView findBatch(
      @PathVariable String id,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    new AdminPrincipal(actor, roles, true).require(AdminRole.EDITOR);
    return service.findBatch(id);
  }
}
