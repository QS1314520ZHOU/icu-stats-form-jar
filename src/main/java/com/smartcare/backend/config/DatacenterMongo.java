package com.smartcare.backend.config;

import java.util.List;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

/**
 * DataCenter 医嘱库独立连接。
 *
 * 故意不把 MongoTemplate 注册成 Spring Bean：
 * 一旦容器里出现 MongoTemplate 类型的 Bean，
 * Spring Boot 的 MongoDataAutoConfiguration 会因
 * {@code @ConditionalOnMissingBean(MongoTemplate.class)} 整体回退，
 * SmartCare 主库（spring.data.mongodb.* 自动配置）和全部 MongoRepository 都会挂掉。
 *
 * 这里用普通类包装，主库配置保持原样，互不影响。
 */
public class DatacenterMongo implements DisposableBean {

    private final SimpleMongoClientDatabaseFactory factory;
    private final MongoTemplate template;

    public DatacenterMongo(String uri) {
        this.factory = new SimpleMongoClientDatabaseFactory(uri);
        this.template = new MongoTemplate(factory);
    }

    public MongoTemplate template() {
        return template;
    }

    public <T> List<T> find(Query query, Class<T> entityClass, String collectionName) {
        return template.find(query, entityClass, collectionName);
    }

    @Override
    public void destroy() {
        try {
            factory.destroy();
        } catch (Exception e) {
            // 关闭连接失败不影响其它 Bean
        }
    }
}
