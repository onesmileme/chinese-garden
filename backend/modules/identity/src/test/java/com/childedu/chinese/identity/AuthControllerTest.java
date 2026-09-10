package com.childedu.chinese.identity;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.identity.api.AuthController;
import com.childedu.chinese.identity.api.AuthErrorHandler;
import com.childedu.chinese.identity.application.AuthResult;
import com.childedu.chinese.identity.application.IdentityService;
import com.childedu.chinese.identity.application.PlatformLoginCommand;
import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class AuthControllerTest {

  @Test
  void exchangesPlatformCodeForTokensAndStringIds() throws Exception {
    IdentityService service = mock(IdentityService.class);
    when(service.platformLogin(
            new PlatformLoginCommand(Platform.WECHAT, "wx-app", "code-1")))
        .thenReturn(
            new AuthResult(
                "access", "refresh", new PrincipalId("principal-1"), new ChildProfileId("child-1")));
    MockMvc mvc =
        standaloneSetup(new AuthController(service))
            .setControllerAdvice(new AuthErrorHandler())
            .build();

    mvc.perform(
            post("/v1/auth/platform-login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"platform":"WECHAT","platformAppId":"wx-app","code":"code-1"}
                    """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").value("access"))
        .andExpect(jsonPath("$.refreshToken").value("refresh"))
        .andExpect(jsonPath("$.principalId").value("principal-1"))
        .andExpect(jsonPath("$.defaultChildId").value("child-1"));
  }

  @Test
  void rejectsBlankLoginCode() throws Exception {
    MockMvc mvc =
        standaloneSetup(new AuthController(mock(IdentityService.class)))
            .setControllerAdvice(new AuthErrorHandler())
            .build();

    mvc.perform(
            post("/v1/auth/platform-login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"platform":"WECHAT","platformAppId":"wx-app","code":""}
                    """))
        .andExpect(status().isBadRequest());
  }
}
