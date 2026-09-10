package com.childedu.chinese.identity.application;

import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;

public record AuthResult(
    String accessToken, String refreshToken, PrincipalId principalId, ChildProfileId defaultChildId) {}
