package com.childedu.chinese.identity.infrastructure;

import com.childedu.chinese.identity.application.ClientRequestAttributes;
import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

public final class ClientAuthFilter extends OncePerRequestFilter {

  public static final String CHILD_HEADER = "X-Child-Profile-Id";
  private final TokenService tokens;
  private final IdentityRepository identities;

  public ClientAuthFilter(TokenService tokens, IdentityRepository identities) {
    this.tokens = tokens;
    this.identities = identities;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return "OPTIONS".equalsIgnoreCase(request.getMethod())
        || !request.getRequestURI().startsWith("/v1/content/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String authorization = request.getHeader("Authorization");
    if (authorization == null || !authorization.startsWith("Bearer ")) {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      return;
    }
    PrincipalId principalId;
    try {
      principalId = tokens.principalOfAccess(authorization.substring("Bearer ".length()));
    } catch (IllegalArgumentException error) {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      return;
    }
    String rawChildId = request.getHeader(CHILD_HEADER);
    if (rawChildId == null || rawChildId.isBlank()) {
      response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
      return;
    }
    ChildProfileId childId = new ChildProfileId(rawChildId);
    if (!identities.canAccess(principalId, childId)) {
      response.setStatus(HttpServletResponse.SC_FORBIDDEN);
      return;
    }
    request.setAttribute(ClientRequestAttributes.PRINCIPAL_ID, principalId);
    request.setAttribute(ClientRequestAttributes.CHILD_ID, childId);
    chain.doFilter(request, response);
  }
}
