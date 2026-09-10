package com.childedu.chinese.sync.api;

import java.util.List;

/** 与 Plan B PushResult 逐字一致：{accepted[], duplicated[], rejected[], serverOffset}。 */
public record PushResponse(
    List<String> accepted, List<String> duplicated, List<String> rejected, long serverOffset) {}
