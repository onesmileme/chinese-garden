package com.childedu.chinese.content.api;

import com.childedu.chinese.content.application.LeveledManifestQuery;
import com.childedu.chinese.shared.ChildProfileId;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/content")
public final class ContentController {

  private final LeveledManifestQuery manifests;

  public ContentController(LeveledManifestQuery manifests) {
    this.manifests = manifests;
  }

  @GetMapping("/manifest")
  @ResponseStatus(HttpStatus.OK)
  public ManifestResponse manifest(
      @RequestAttribute("client.childId") ChildProfileId childId) {
    return manifests.forChild(childId);
  }
}
