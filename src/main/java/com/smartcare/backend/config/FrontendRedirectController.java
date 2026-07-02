package com.smartcare.backend.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 前端界面重定向控制器
 * 将目录访问重定向到对应的 index.html
 */
@Controller
public class FrontendRedirectController {

    @GetMapping("/form")
    public String redirectToFormIndex() {
        return "forward:/form/index.html";
    }

    @GetMapping("/form/")
    public String redirectToFormIndexWithSlash() {
        return "forward:/form/index.html";
    }

    // 未来新增示例：
    // @GetMapping("/demo2")
    // public String redirectToDemo2Index() {
    //     return "forward:/demo2/index.html";
    // }
    //
    // @GetMapping("/demo2/")
    // public String redirectToDemo2IndexWithSlash() {
    //     return "forward:/demo2/index.html";
    // }
}
