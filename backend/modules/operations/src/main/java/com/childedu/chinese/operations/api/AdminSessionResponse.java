package com.childedu.chinese.operations.api;

import com.childedu.chinese.operations.domain.AdminRole;
import java.util.Set;

public record AdminSessionResponse(String actor, Set<AdminRole> roles, boolean active) {}
