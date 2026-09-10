package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

public class JdbcAdminPrincipalRepository implements AdminPrincipalRepository {

  private static final TypeReference<Set<AdminRole>> ROLE_SET = new TypeReference<>() {};

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;

  public JdbcAdminPrincipalRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
  }

  @Override
  public Optional<AdminPrincipal> findByTokenDigest(String tokenDigest) {
    return jdbc
        .query(
            """
            SELECT actor, roles_json, status
            FROM admin_principal
            WHERE token_sha256 = ?
            """,
            (resultSet, rowNumber) ->
                new AdminPrincipal(
                    resultSet.getString("actor"),
                    readRoles(resultSet.getString("roles_json")),
                    "ACTIVE".equals(resultSet.getString("status"))),
            tokenDigest)
        .stream()
        .findFirst();
  }

  private Set<AdminRole> readRoles(String rolesJson) {
    try {
      return objectMapper.readValue(rolesJson, ROLE_SET);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("cannot parse admin principal roles", e);
    }
  }
}
