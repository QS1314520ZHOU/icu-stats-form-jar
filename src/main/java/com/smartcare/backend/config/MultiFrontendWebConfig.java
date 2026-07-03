package com.smartcare.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.util.Map;

/**
 * 多前端界面资源配置
 * 支持通过不同URL路径前缀访问不同前端界面
 *
 * 扩展方式：在 FRONTEND_MAPPINGS 中添加新的映射即可
 * 例如：添加 "demo2" -> "demo2" 映射后，访问 /demo2/ 即可加载 demo2 界面
 */
@Configuration
public class MultiFrontendWebConfig implements WebMvcConfigurer {

    /**
     * 前缀 -> 静态目录 映射
     * key: URL路径前缀（如 "text"）
     * value: classpath:/static/ 下的子目录名（如 "text"）
     */
    private static final Map<String, String> FRONTEND_MAPPINGS = Map.of(
            "form", "form"
            // 未来新增示例：
            // "demo2", "demo2"
            // "admin", "admin-panel"
    );

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        for (Map.Entry<String, String> entry : FRONTEND_MAPPINGS.entrySet()) {
            String prefix = entry.getKey();
            String dir = entry.getValue();

            registry.addResourceHandler("/" + prefix + "/**")
                    .addResourceLocations("classpath:/static/" + dir + "/")
                    .resourceChain(true)
                    .addResolver(new SpaPathResourceResolver(dir));
        }
    }

    /**
     * SPA路径资源解析器
     * 实现单页应用的深链刷新支持：
     * 1. 如果请求的资源真实存在，直接返回
     * 2. 如果资源不存在，回退到该前端界面的 index.html
     * 3. 如果 index.html 也不存在，返回 null（404 而非 500）
     */
    private static class SpaPathResourceResolver extends PathResourceResolver {
        private static final Logger log = LoggerFactory.getLogger(SpaPathResourceResolver.class);
        private final String frontendDir;

        public SpaPathResourceResolver(String frontendDir) {
            this.frontendDir = frontendDir;
        }

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            // 如果路径为空（访问目录），返回 index.html
            if (resourcePath == null || resourcePath.isEmpty()) {
                Resource idx = location.createRelative("index.html");
                return (idx.exists() && idx.isReadable()) ? idx : null;
            }

            // 尝试获取请求的资源
            Resource resource = location.createRelative(resourcePath);

            // 如果资源存在且可读，直接返回
            if (resource.exists() && resource.isReadable()) {
                return resource;
            }

            // 深链回退 index.html，但必须真实存在才返回
            Resource idx = location.createRelative("index.html");
            if (idx.exists() && idx.isReadable()) {
                return idx;
            }

            // index.html 也不存在，返回 null（404 而非 500）
            log.warn("SPA index.html missing under {}, path={}", location, resourcePath);
            return null;
        }
    }
}
