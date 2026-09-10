package com.childedu.chinese.operations.api;

public record AdminErrorResponse(String code, String message, String path, Object details) {}
