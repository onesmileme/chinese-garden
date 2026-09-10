package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.LevelCoverage;
import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import java.util.List;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/content/levels/coverage")
public class LevelCoverageController {

  private final ContentAuthoringService service;

  public LevelCoverageController(ContentAuthoringService service) {
    this.service = service;
  }

  @GetMapping
  public List<LevelCoverage> coverage(
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return service.coverage(new AdminPrincipal(actor, roles, true));
  }
}
