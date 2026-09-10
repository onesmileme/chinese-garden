package com.childedu.chinese.identity.application;

import com.childedu.chinese.shared.PrincipalId;
import java.time.Instant;

public record RefreshClaims(PrincipalId principalId, String jti, Instant expiresAt) {}
