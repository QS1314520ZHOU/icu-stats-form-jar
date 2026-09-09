package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;

/**
 * 表单数据存在性探测器接口。
 * 每个表单实现一个探测器，由 IcuFormViewerService 统一调度。
 */
public interface IcuFormDataProbe {

    /** 返回该探测器负责的表单 key（与前端 registry 一致） */
    String formKey();

    /** 检查指定患者在时间范围内是否有该表单的数据 */
    IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive);
}
