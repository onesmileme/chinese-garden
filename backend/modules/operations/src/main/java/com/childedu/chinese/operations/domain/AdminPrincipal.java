package com.childedu.chinese.operations.domain;

import java.util.Objects;
import java.util.Set;

public record AdminPrincipal(String actor, Set<AdminRole> roles, boolean active) {

  public AdminPrincipal {
    if (actor == null || actor.isBlank()) {
      throw new IllegalArgumentException("admin actor must not be blank");
    }
    roles = Set.copyOf(Objects.requireNonNull(roles, "admin roles must not be null"));
  }

  public void require(AdminRole role) {
    Objects.requireNonNull(role, "admin role must not be null");
    if (!active || (!roles.contains(AdminRole.ADMIN) && !roles.contains(role))) {
      throw new SecurityException("missing admin role: " + role);
    }
  }
}
