package com.childedu.chinese.operations.api;

import com.childedu.chinese.operations.application.ContentAdminService;
import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 受 AdminAuthFilter 保护的内容发布管理入口。 */
@RestController
@RequestMapping("/v1/admin/content/releases")
public class ContentAdminController {

  private final ContentAdminService service;

  public ContentAdminController(ContentAdminService service) {
    this.service = service;
  }

  @GetMapping
  public ContentReleasePageResponse search(
      @RequestParam(required = false) ReleaseStatus status,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") int limit,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    requirePublisher(actor, roles);
    return ContentReleasePageResponse.from(service.search(status, cursor, limit));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void register(
      @RequestBody RegisterReleaseRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    requirePublisher(actor, roles);
    service.register(request, actor);
  }

  @PostMapping("/snapshots")
  @ResponseStatus(HttpStatus.CREATED)
  public ReleaseSnapshotResponse createSnapshot(
      @RequestBody CreateReleaseRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    requirePublisher(actor, roles);
    return ReleaseSnapshotResponse.from(service.createSnapshot(request, actor));
  }

  @GetMapping("/{version}/snapshot")
  public ReleaseSnapshotResponse snapshot(
      @PathVariable String version,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    requirePublisher(actor, roles);
    return service.snapshot(version);
  }

  @PostMapping("/{version}/artifacts")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void registerArtifacts(
      @PathVariable String version,
      @RequestBody RegisterArtifactsRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    requirePublisher(actor, roles);
    service.registerArtifacts(version, request, actor);
  }

  @PostMapping("/{version}/status")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void transition(
      @PathVariable String version,
      @RequestBody TransitionRequest request,
      @RequestAttribute(AdminRequestAttributes.ACTOR) String actor,
      @RequestAttribute(AdminRequestAttributes.ROLES) Set<AdminRole> roles) {
    if (request == null) {
      throw new IllegalArgumentException("transition request must not be null");
    }
    requirePublisher(actor, roles);
    service.transition(version, request.toStatus(), actor);
  }

  private static void requirePublisher(String actor, Set<AdminRole> roles) {
    new AdminPrincipal(actor, roles, true).require(AdminRole.PUBLISHER);
  }
}
