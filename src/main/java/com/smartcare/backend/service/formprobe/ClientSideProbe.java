package com.smartcare.backend.service.formprobe;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import java.time.Instant;

/**
 * 客户端数据源探测器（如 wpgmForm 使用 localStorage）。
 * 后端无法判断客户端是否有数据，返回 CLIENT_SIDE 状态。
 */
public class ClientSideProbe implements IcuFormDataProbe {

    private final String formKey;

    public ClientSideProbe(String formKey) {
        this.formKey = formKey;
    }

    @Override
    public String formKey() {
        return formKey;
    }

    @Override
    public IcuFormAvailabilityResponse check(String pid, Instant start, Instant endExclusive) {
        return IcuFormAvailabilityResponse.clientSide(formKey);
    }
}
