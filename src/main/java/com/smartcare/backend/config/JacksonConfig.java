package com.smartcare.backend.config;

import java.util.TimeZone;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

@Configuration
public class JacksonConfig
{
@Bean
public Jackson2ObjectMapperBuilderCustomizer jacksonDateCustomizer() {
return builder -> {
builder.simpleDateFormat("yyyy-MM-dd HH:mm:ss");
builder.timeZone(TimeZone.getTimeZone("GMT+8"));
};
}
}

