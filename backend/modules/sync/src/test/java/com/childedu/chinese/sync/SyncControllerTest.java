package com.childedu.chinese.sync;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.learning.domain.LearningEventType;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.sync.api.PullResponse;
import com.childedu.chinese.sync.api.PushResponse;
import com.childedu.chinese.sync.api.SyncController;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.sync.application.SyncService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class SyncControllerTest {

  @Test
  void pushEndpointReturnsContractShape() throws Exception {
    SyncService svc = mock(SyncService.class);
    when(svc.push(any()))
        .thenReturn(new PushResponse(List.of("a1"), List.of(), List.of(), 7L));
    MockMvc mvc = standaloneSetup(new SyncController(svc)).build();

    mvc.perform(
            post("/v1/sync/push")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"events\":[]}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accepted[0]").value("a1"))
        .andExpect(jsonPath("$.duplicated").isArray())
        .andExpect(jsonPath("$.rejected").isArray())
        .andExpect(jsonPath("$.serverOffset").value(7));
  }

  @Test
  void pullEndpointReturnsContractShape() throws Exception {
    SyncService svc = mock(SyncService.class);
    StoredEvent e =
        new StoredEvent(
            "01ARZ3NDEKTSV4RRFFQ69G5AA1", new ChildProfileId("c1"), "dev1", "s1",
            LearningEventType.LESSON_ANSWER, 11L, "2026.01", "mastery-v1",
            1_700_000_000_000L, 11L, Map.of("k", "v"));
    when(svc.pull(eq(10L), anyInt())).thenReturn(new PullResponse(List.of(e), 11L));
    MockMvc mvc = standaloneSetup(new SyncController(svc)).build();

    mvc.perform(get("/v1/sync/pull").param("cursor", "10").param("limit", "100"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.events[0].eventId").value("01ARZ3NDEKTSV4RRFFQ69G5AA1"))
        .andExpect(jsonPath("$.events[0].serverOffset").value(11))
        .andExpect(jsonPath("$.nextCursor").value(11));
  }
}
