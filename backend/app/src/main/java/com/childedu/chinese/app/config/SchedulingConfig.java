package com.childedu.chinese.app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 启用 @Scheduled，让 OutboxWorker.poll 周期运行。 */
@Configuration
@EnableScheduling
public class SchedulingConfig {}
