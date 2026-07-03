package com.smartcare.backend.config;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.TimeZone;

/**
 * 实体时间字段统一使用 {@link java.util.Date} 存库；与 bootstrap.yml 中 jackson 配置一致，
 * 保证 JSON 与 Mongo 序列化均为 yyyy-MM-dd HH:mm:ss（东八区）。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonDateCustomizer() {
        return builder -> {
            builder.simpleDateFormat("yyyy-MM-dd HH:mm:ss");
            builder.timeZone(TimeZone.getTimeZone("GMT+8"));
        };
    }
}
