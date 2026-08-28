package com.smartcare.backend.config;

import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handle(Exception e) {
        // 客户端提前断开连接（如用户切换页面），降级为 WARN
        if (e instanceof ClientAbortException) {
            log.warn("Client disconnected: {}", e.getMessage());
            return ResponseEntity.status(499).body("Client disconnected");
        }
        log.error("Unhandled error", e);
        return ResponseEntity.status(500)
                .body(e.getClass().getName() + ": " + e.getMessage());
    }
}
