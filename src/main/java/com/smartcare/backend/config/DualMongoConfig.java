package com.smartcare.backend.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.convert.MongoConverter;

/**
 * SmartCare + DataCenter 双 MongoDB 数据源。
 * SmartCare 为主数据源（患者、床旁、护理记录等），
 * DataCenter 为医嘱等业务数据源（VI_ICU_ZYYZ）。
 */
@Configuration
public class DualMongoConfig {

    @Bean
    @Primary
    public MongoDatabaseFactory smartcareMongoDatabaseFactory(
            @Value("${spring.data.mongodb.smartcare.uri}") String uri) {
        return new SimpleMongoClientDatabaseFactory(uri);
    }

    @Bean
    @Primary
    public MongoTemplate smartcareMongoTemplate(
            MongoDatabaseFactory factory,
            MongoConverter converter) {
        return new MongoTemplate(factory, converter);
    }

    @Bean
    public MongoDatabaseFactory datacenterMongoDatabaseFactory(
            @Value("${spring.data.mongodb.datacenter.uri}") String uri) {
        return new SimpleMongoClientDatabaseFactory(uri);
    }

    @Bean
    public MongoTemplate datacenterMongoTemplate(
            @Qualifier("datacenterMongoDatabaseFactory") MongoDatabaseFactory factory,
            MongoConverter converter) {
        return new MongoTemplate(factory, converter);
    }
}
