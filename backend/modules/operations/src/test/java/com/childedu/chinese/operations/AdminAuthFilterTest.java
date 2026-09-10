package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.application.AdminTokenDigest;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.childedu.chinese.operations.infrastructure.AdminAuthFilter;
import jakarta.servlet.FilterChain;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AdminAuthFilterTest {

  @Test
  void hashesTokensAsLowercaseSha256() {
    assertThat(AdminTokenDigest.sha256("editor-token"))
        .isEqualTo("43dd47c3c09b91fa6c62f8227abd0a3958c608f5b8b477adc042d963af6dc84b");
  }

  @Test
  void authenticatesAnActiveEditorAndExposesItsIdentity() throws Exception {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    AdminPrincipal editor =
        new AdminPrincipal("editor-1", Set.of(AdminRole.EDITOR), true);
    when(principals.findByTokenDigest(AdminTokenDigest.sha256("editor-token")))
        .thenReturn(Optional.of(editor));
    AdminAuthFilter filter = new AdminAuthFilter(principals, "10.0.0.0/8,127.0.0.1");
    MockHttpServletRequest request = adminRequest("10.20.30.40", "editor-token");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
    assertThat(request.getAttribute(AdminAuthFilter.ACTOR_ATTRIBUTE)).isEqualTo("editor-1");
    assertThat(request.getAttribute(AdminAuthFilter.ROLES_ATTRIBUTE))
        .isEqualTo(Set.of(AdminRole.EDITOR));
    assertThatThrownBy(() -> editor.require(AdminRole.PUBLISHER))
        .isInstanceOf(SecurityException.class)
        .hasMessageContaining("PUBLISHER");
    assertThatCode(
            () ->
                new AdminPrincipal("admin-1", Set.of(AdminRole.ADMIN), true)
                    .require(AdminRole.PUBLISHER))
        .doesNotThrowAnyException();
  }

  @Test
  void rejectsMissingAndUnknownTokensBeforeTheChain() throws Exception {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    when(principals.findByTokenDigest(AdminTokenDigest.sha256("unknown")))
        .thenReturn(Optional.empty());
    AdminAuthFilter filter = new AdminAuthFilter(principals, "127.0.0.1");
    FilterChain chain = mock(FilterChain.class);

    MockHttpServletResponse missingResponse = new MockHttpServletResponse();
    filter.doFilter(adminRequest("127.0.0.1", null), missingResponse, chain);

    MockHttpServletResponse unknownResponse = new MockHttpServletResponse();
    filter.doFilter(adminRequest("127.0.0.1", "unknown"), unknownResponse, chain);

    assertThat(missingResponse.getStatus()).isEqualTo(401);
    assertThat(unknownResponse.getStatus()).isEqualTo(401);
    verifyNoInteractions(chain);
  }

  @Test
  void rejectsDisabledPrincipalsAndPrincipalsWithoutRoles() throws Exception {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    when(principals.findByTokenDigest(AdminTokenDigest.sha256("disabled-token")))
        .thenReturn(
            Optional.of(
                new AdminPrincipal("disabled-1", Set.of(AdminRole.EDITOR), false)));
    when(principals.findByTokenDigest(AdminTokenDigest.sha256("roleless-token")))
        .thenReturn(Optional.of(new AdminPrincipal("roleless-1", Set.of(), true)));
    AdminAuthFilter filter = new AdminAuthFilter(principals, "127.0.0.1");
    FilterChain chain = mock(FilterChain.class);

    MockHttpServletResponse disabledResponse = new MockHttpServletResponse();
    filter.doFilter(
        adminRequest("127.0.0.1", "disabled-token"), disabledResponse, chain);

    MockHttpServletResponse rolelessResponse = new MockHttpServletResponse();
    filter.doFilter(
        adminRequest("127.0.0.1", "roleless-token"), rolelessResponse, chain);

    assertThat(disabledResponse.getStatus()).isEqualTo(403);
    assertThat(rolelessResponse.getStatus()).isEqualTo(403);
    verifyNoInteractions(chain);
  }

  @Test
  void rejectsAnAddressOutsideTheAllowListBeforeResolvingTheToken() throws Exception {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    AdminAuthFilter filter = new AdminAuthFilter(principals, "10.0.0.0/8");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(adminRequest("192.168.1.10", "editor-token"), response, chain);

    assertThat(response.getStatus()).isEqualTo(403);
    verifyNoInteractions(chain);
    verifyNoInteractions(principals);
  }

  @Test
  void leavesNonAdminPathsUntouched() throws Exception {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    AdminAuthFilter filter = new AdminAuthFilter(principals, "127.0.0.1");
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/v1/content/manifest");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
    verifyNoInteractions(principals);
  }

  @Test
  void rejectsBlankConfigurationInsteadOfAllowingEveryAddress() {
    AdminPrincipalRepository principals = mock(AdminPrincipalRepository.class);
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new AdminAuthFilter(principals, " "))
        .withMessageContaining("allowed");
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new AdminAuthFilter(null, "127.0.0.1"))
        .withMessageContaining("repository");
  }

  private static MockHttpServletRequest adminRequest(String address, String token) {
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/v1/admin/content/releases");
    request.setRemoteAddr(address);
    if (token != null) {
      request.addHeader(AdminAuthFilter.TOKEN_HEADER, token);
    }
    return request;
  }
}
