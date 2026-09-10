package com.childedu.chinese.identity.domain;

/** 领域端口：用平台临时 code 换取平台内唯一用户标识（openid 等）。 */
public interface PlatformGateway {
  String exchangeExternalUserId(String platformAppId, String code);
}
