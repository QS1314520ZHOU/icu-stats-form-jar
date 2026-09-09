package com.smartcare.backend.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 外部入口控制器：/getIcuForm?mrn=xxx -> 302 重定向到 /form/getIcuForm?mrn=xxx
 */
@Controller
public class IcuFormEntryController {

    /**
     * 标准入口：GET /getIcuForm?mrn=12346
     * 重定向到 /form/getIcuForm?mrn=12346
     */
    @GetMapping("/getIcuForm")
    public RedirectView redirectToFormViewer(
            @RequestParam(required = false) String mrn) {

        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/form/getIcuForm");
        if (mrn != null && !mrn.trim().isEmpty()) {
            builder.queryParam("mrn", mrn.trim());
        }
        return new RedirectView(builder.toUriString(), true);
    }

    /**
     * 兼容旧格式：GET /getIcuForm/ (带斜杠)
     */
    @GetMapping("/getIcuForm/")
    public RedirectView redirectToFormViewerWithSlash(
            @RequestParam(required = false) String mrn) {
        return redirectToFormViewer(mrn);
    }

    /**
     * 兼容旧格式：GET /getIcuForm&mrn={mrn}
     * 注意：Spring MVC 不会自动解析 & 为参数分隔符在路径中，此映射作为安全兜底。
     * 实际上 &mrn=xxx 会被当做路径的一部分，需要通过 path pattern 匹配。
     */
    @GetMapping("/getIcuForm&mrn={mrn}")
    public RedirectView redirectToFormViewerLegacy(@PathVariable String mrn) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/form/getIcuForm");
        if (mrn != null && !mrn.trim().isEmpty()) {
            builder.queryParam("mrn", mrn.trim());
        }
        return new RedirectView(builder.toUriString(), true);
    }
}
