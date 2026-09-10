package com.childedu.chinese.operations.api;

import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.domain.AdminRole;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/session")
public class AdminSessionController {

  @GetMapping
  public AdminSessionResponse session(
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return new AdminSessionResponse(actor, roles, true);
  }
}
