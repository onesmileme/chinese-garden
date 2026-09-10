package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.application.AdminTokenDigest;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import java.util.Set;

public class BootstrapAdminPrincipalRepository implements AdminPrincipalRepository {

  private static final Set<AdminRole> ALL_ROLES = Set.of(AdminRole.values());

  private final AdminPrincipalRepository delegate;
  private final byte[] bootstrapDigest;

  public BootstrapAdminPrincipalRepository(AdminPrincipalRepository delegate, String bootstrapToken) {
    this.delegate = delegate;
    this.bootstrapDigest =
        bootstrapToken == null || bootstrapToken.isBlank()
            ? null
            : AdminTokenDigest.sha256(bootstrapToken).getBytes(StandardCharsets.US_ASCII);
  }

  @Override
  public Optional<AdminPrincipal> findByTokenDigest(String tokenDigest) {
    byte[] suppliedDigest = tokenDigest.getBytes(StandardCharsets.US_ASCII);
    if (bootstrapDigest != null && MessageDigest.isEqual(bootstrapDigest, suppliedDigest)) {
      return Optional.of(new AdminPrincipal("bootstrap-admin", ALL_ROLES, true));
    }
    return delegate.findByTokenDigest(tokenDigest);
  }
}
