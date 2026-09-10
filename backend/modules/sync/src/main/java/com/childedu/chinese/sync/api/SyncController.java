package com.childedu.chinese.sync.api;

import com.childedu.chinese.sync.application.SyncService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 同步端点。契约与 Plan B SyncClient 逐字一致。 */
@RestController
@RequestMapping("/v1/sync")
public class SyncController {

  private final SyncService syncService;

  public SyncController(SyncService syncService) {
    this.syncService = syncService;
  }

  @PostMapping("/push")
  public PushResponse push(@RequestBody PushRequest request) {
    return syncService.push(request);
  }

  @GetMapping("/pull")
  public PullResponse pull(
      @RequestParam("cursor") long cursor,
      @RequestParam(name = "limit", defaultValue = "100") int limit) {
    return syncService.pull(cursor, limit);
  }
}
