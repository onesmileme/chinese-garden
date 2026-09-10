package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ContentIssue;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/content/items")
public class ContentItemAdminController {

  private final ContentAuthoringService service;

  public ContentItemAdminController(ContentAuthoringService service) {
    this.service = service;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public ContentItemView create(
      @RequestBody SaveContentRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return service.create(request, principal(actor, roles));
  }

  @GetMapping
  public ContentPageResponse search(
      @RequestParam(required = false) ContentType type,
      @RequestParam(required = false) ContentLevel level,
      @RequestParam(required = false) ContentStatus status,
      @RequestParam(required = false) String tag,
      @RequestParam(required = false) String keyword,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") int limit) {
    return service.search(type, level, status, tag, keyword, cursor, limit);
  }

  @GetMapping("/{id}")
  public ContentItemView find(@PathVariable String id) {
    return service.find(id);
  }

  @PatchMapping("/{id}")
  public ContentItemView update(
      @PathVariable String id,
      @RequestParam int expectedRevision,
      @RequestBody SaveContentRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return service.update(id, expectedRevision, request, principal(actor, roles));
  }

  @PostMapping("/{id}/validate")
  public ValidationResponse validate(
      @PathVariable String id,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    List<ContentIssue> issues = service.validate(id, principal(actor, roles));
    return new ValidationResponse(issues.isEmpty(), issues);
  }

  @PostMapping("/{id}/activate")
  public ContentItemView activate(
      @PathVariable String id,
      @RequestParam int expectedRevision,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return service.activate(id, expectedRevision, principal(actor, roles));
  }

  @PostMapping("/{id}/archive")
  public ContentItemView archive(
      @PathVariable String id,
      @RequestParam int expectedRevision,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    return service.archive(id, expectedRevision, principal(actor, roles));
  }

  private static AdminPrincipal principal(String actor, Set<AdminRole> roles) {
    return new AdminPrincipal(actor, roles, true);
  }

  public record ValidationResponse(boolean valid, List<ContentIssue> issues) {

    public ValidationResponse {
      issues = List.copyOf(issues);
    }
  }
}
