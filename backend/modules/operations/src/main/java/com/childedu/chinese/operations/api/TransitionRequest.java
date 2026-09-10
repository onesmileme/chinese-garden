package com.childedu.chinese.operations.api;

/** 管理接口只接受目标状态，当前状态始终由服务端读取。 */
public record TransitionRequest(String toStatus) {}
