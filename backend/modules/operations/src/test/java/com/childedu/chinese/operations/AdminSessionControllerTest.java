package com.childedu.chinese.operations;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.operations.api.AdminSessionController;
import com.childedu.chinese.operations.domain.AdminRole;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

class AdminSessionControllerTest {

  @Test
  void returnsAuthenticatedSessionWithoutEchoingToken() throws Exception {
    MockMvc mvc = standaloneSetup(new AdminSessionController()).build();

    mvc.perform(
            get("/v1/admin/session")
                .requestAttr("admin.actor", "admin-1")
                .requestAttr("admin.roles", Set.of(AdminRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actor").value("admin-1"))
        .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
        .andExpect(jsonPath("$.active").value(true))
        .andExpect(jsonPath("$.token").doesNotExist());
  }
}
