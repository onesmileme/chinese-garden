package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.childedu.chinese.identity.application.ClientRequestAttributes;
import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.identity.infrastructure.ClientAuthFilter;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import jakarta.servlet.FilterChain;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ClientAuthFilterTest {

  private static final byte[] SECRET = "0123456789abcdef0123456789abcdef".getBytes();
  private final TokenService tokens =
      new TokenService(SECRET, () -> Instant.parse("2026-08-29T00:00:00Z"));
  private final IdentityRepository identities = mock(IdentityRepository.class);
  private final ClientAuthFilter filter = new ClientAuthFilter(tokens, identities);

  @Test
  void authenticatesOwnedChildForContentRequest() throws Exception {
    PrincipalId principal = new PrincipalId("principal-1");
    ChildProfileId child = new ChildProfileId("child-1");
    when(identities.canAccess(principal, child)).thenReturn(true);
    MockHttpServletRequest request = request("/v1/content/manifest");
    request.addHeader("Authorization", "Bearer " + tokens.issueAccess(principal));
    request.addHeader("X-Child-Profile-Id", child.value());
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
    assertThat(request.getAttribute(ClientRequestAttributes.PRINCIPAL_ID)).isEqualTo(principal);
    assertThat(request.getAttribute(ClientRequestAttributes.CHILD_ID)).isEqualTo(child);
  }

  @Test
  void returnsBadRequestWhenChildHeaderIsMissing() throws Exception {
    MockHttpServletRequest request = request("/v1/content/manifest");
    request.addHeader(
        "Authorization", "Bearer " + tokens.issueAccess(new PrincipalId("principal-1")));
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    assertThat(response.getStatus()).isEqualTo(400);
    verify(chain, never()).doFilter(request, response);
  }

  @Test
  void returnsForbiddenForUnrelatedChild() throws Exception {
    MockHttpServletRequest request = request("/v1/content/manifest");
    request.addHeader(
        "Authorization", "Bearer " + tokens.issueAccess(new PrincipalId("principal-1")));
    request.addHeader("X-Child-Profile-Id", "child-2");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    assertThat(response.getStatus()).isEqualTo(403);
    verify(chain, never()).doFilter(request, response);
  }

  @Test
  void rejectsRefreshTokenAsBearerAccess() throws Exception {
    MockHttpServletRequest request = request("/v1/content/manifest");
    request.addHeader(
        "Authorization",
        "Bearer " + tokens.issueRefresh(new PrincipalId("principal-1"), "refresh-1"));
    request.addHeader("X-Child-Profile-Id", "child-1");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    assertThat(response.getStatus()).isEqualTo(401);
    verify(chain, never()).doFilter(request, response);
  }

  private static MockHttpServletRequest request(String uri) {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
    request.setRequestURI(uri);
    return request;
  }
}
