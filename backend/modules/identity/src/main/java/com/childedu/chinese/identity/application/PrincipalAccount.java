package com.childedu.chinese.identity.application;

import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;

public record PrincipalAccount(
    PrincipalId principalId, ChildProfileId defaultChildId, boolean active) {}
