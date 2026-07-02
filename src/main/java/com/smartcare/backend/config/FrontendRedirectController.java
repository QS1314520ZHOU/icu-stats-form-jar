package com.smartcare.backend.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 前端界面重定向控制器
 * 将目录访问重定向到对应的 index.html
 */
@Controller
public class FrontendRedirectController {

    // 根 -> 自定义首页（不再被 SmartCare 的 ''→/crrt 抢占）
    @GetMapping("/")
    public String home() {
        return "forward:/home.html";
    }

    // SmartCare 的一级路由都交给它的 index.html（SPA 接管，深链刷新可用）
    @GetMapping({"/crrt", "/cvc", "/rm", "/picco", "/iabp", "/pe", "/hp", "/protein-a"})
    public String smartcare() {
        return "forward:/index.html";
    }

    // form 前缀路由
    @GetMapping("/form")
    public String redirectToFormIndex() {
        return "forward:/form/index.html";
    }

    @GetMapping("/form/")
    public String redirectToFormIndexWithSlash() {
        return "forward:/form/index.html";
    }
}
