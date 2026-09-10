package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.testsupport.MySqlContainerSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class OpenApiContractIT {

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrl);
    registry.add("spring.datasource.username", MySqlContainerSupport::username);
    registry.add("spring.datasource.password", MySqlContainerSupport::password);
  }

  @Autowired MockMvc mvc;

  @Test
  void apiDocsExposeSyncContractFieldNames() throws Exception {
    MvcResult res =
        mvc.perform(
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                    "/v3/api-docs"))
            .andReturn();
    String body = res.getResponse().getContentAsString();

    assertThat(body).contains("\"accepted\"");
    assertThat(body).contains("\"duplicated\"");
    assertThat(body).contains("\"rejected\"");
    assertThat(body).contains("\"serverOffset\"");
    assertThat(body).contains("\"nextCursor\"");
    assertThat(body).contains("\"eventId\"");
    assertThat(body).contains("\"clientSequence\"");
    assertThat(body).contains("\"contentVersion\"");
    assertThat(body).contains("\"ruleVersion\"");
    assertThat(body).contains("\"occurredAt\"");
    assertThat(body).contains("\"/v1/admin/content/items\"");
    assertThat(body).contains("\"/v1/admin/content/items/{id}\"");
    assertThat(body).contains("\"/v1/admin/content/items/{id}/validate\"");
    assertThat(body).contains("\"/v1/admin/content/items/{id}/activate\"");
    assertThat(body).contains("\"/v1/admin/content/items/{id}/archive\"");
    assertThat(body).contains("\"/v1/admin/content/levels/coverage\"");
  }
}
