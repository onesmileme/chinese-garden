package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ContentIssue;
import com.childedu.chinese.operations.application.ContentRevisionConflict;
import com.childedu.chinese.operations.application.ContentValidationException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** 管理接口返回稳定错误码和字段路径，不回显请求正文或认证材料。 */
@RestControllerAdvice(
    assignableTypes = {
      ContentAdminController.class,
      ContentImportController.class,
      ContentItemAdminController.class,
      AdminSessionController.class,
      LevelCoverageController.class
    })
public class AdminExceptionHandler {

  @ExceptionHandler(ContentRevisionConflict.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  AdminErrorResponse revisionConflict(ContentRevisionConflict error) {
    return new AdminErrorResponse(
        "CONTENT_REVISION_CONFLICT",
        error.getMessage(),
        "/expectedRevision",
        Map.of(
            "expectedRevision", error.expectedRevision(),
            "actualRevision", error.actualRevision()));
  }

  @ExceptionHandler(ContentValidationException.class)
  @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
  AdminErrorResponse validation(ContentValidationException error) {
    List<ContentIssue> issues = error.issues();
    ContentIssue first = issues.getFirst();
    return new AdminErrorResponse(
        first.code().name(), error.getMessage(), first.path(), issues);
  }

  @ExceptionHandler(IllegalArgumentException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  AdminErrorResponse badRequest(IllegalArgumentException error) {
    return fieldError(error.getMessage());
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MissingServletRequestParameterException.class,
    MethodArgumentTypeMismatchException.class
  })
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  AdminErrorResponse malformedRequest(Exception error) {
    return fieldError("request field is missing or malformed");
  }

  @ExceptionHandler(IllegalStateException.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  AdminErrorResponse conflict(IllegalStateException error) {
    return new AdminErrorResponse(
        "ADMIN_STATE_CONFLICT", error.getMessage(), null, Map.of());
  }

  @ExceptionHandler(SecurityException.class)
  @ResponseStatus(HttpStatus.FORBIDDEN)
  AdminErrorResponse forbidden(SecurityException error) {
    return new AdminErrorResponse(
        "ADMIN_ROLE_FORBIDDEN", error.getMessage(), null, Map.of());
  }

  private static AdminErrorResponse fieldError(String message) {
    return new AdminErrorResponse("CONTENT_FIELD_INVALID", message, null, Map.of());
  }
}
