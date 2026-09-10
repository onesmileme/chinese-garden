package com.childedu.chinese.identity.application;

import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import java.time.Instant;
import java.util.Optional;

public interface IdentityRepository {

  Optional<PrincipalAccount> find(
      Platform platform, String platformAppId, String externalUserId);

  PrincipalAccount createPrincipalWithDefaultChild(
      PrincipalId principalId,
      Platform platform,
      String platformAppId,
      String externalUserId,
      ChildProfileId childId,
      Instant now);

  ChildProfileId requireDefaultChild(PrincipalId principalId);

  boolean canAccess(PrincipalId principalId, ChildProfileId childId);

  boolean isActive(PrincipalId principalId);
}
