package com.childedu.chinese.operations.application;

import com.childedu.chinese.operations.domain.AdminPrincipal;
import java.util.Optional;

public interface AdminPrincipalRepository {

  Optional<AdminPrincipal> findByTokenDigest(String tokenDigest);
}
