package com.smartcare.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * DataCenter 医嘱库装配。
 * 连接串配置在 yml 顶层 {@code datacenter.mongodb.uri}，
 * 不占用 {@code spring.data.mongodb.*}，主库自动配置不受影响。
 *
 * 该项可选：未配置时创建空实例，医嘱查询返回空，服务照常启动。
 */
@Configuration
public class DatacenterMongoConfig {

    @Bean
    public DatacenterMongo datacenterMongo(
            @Value("${datacenter.mongodb.uri:}") String uri) {
        return (uri == null || uri.trim().isEmpty())
            ? DatacenterMongo.disabled()
            : new DatacenterMongo(uri.trim());
    }
}
