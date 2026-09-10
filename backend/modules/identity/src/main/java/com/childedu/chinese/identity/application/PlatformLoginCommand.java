package com.childedu.chinese.identity.application;

import com.childedu.chinese.identity.domain.Platform;

public record PlatformLoginCommand(Platform platform, String platformAppId, String code) {}
