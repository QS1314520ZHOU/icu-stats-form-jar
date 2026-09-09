package com.smartcare.backend.dto;

public class IcuFormAvailabilityResponse {

    private String formKey;
    private IcuFormAvailabilityStatus status;
    private Boolean hasData;
    private Long count;
    private String message;

    public IcuFormAvailabilityResponse() {
    }

    public IcuFormAvailabilityResponse(String formKey, IcuFormAvailabilityStatus status,
                                       Boolean hasData, Long count, String message) {
        this.formKey = formKey;
        this.status = status;
        this.hasData = hasData;
        this.count = count;
        this.message = message;
    }

    public static IcuFormAvailabilityResponse available(String formKey, long count) {
        return new IcuFormAvailabilityResponse(formKey, IcuFormAvailabilityStatus.AVAILABLE, true, count, null);
    }

    public static IcuFormAvailabilityResponse empty(String formKey) {
        return new IcuFormAvailabilityResponse(formKey, IcuFormAvailabilityStatus.EMPTY, false, 0L, "没有相关的表单数据");
    }

    public static IcuFormAvailabilityResponse clientSide(String formKey) {
        return new IcuFormAvailabilityResponse(formKey, IcuFormAvailabilityStatus.CLIENT_SIDE, null, null, null);
    }

    public static IcuFormAvailabilityResponse error(String formKey, String message) {
        return new IcuFormAvailabilityResponse(formKey, IcuFormAvailabilityStatus.ERROR, null, null, message);
    }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }
    public IcuFormAvailabilityStatus getStatus() { return status; }
    public void setStatus(IcuFormAvailabilityStatus status) { this.status = status; }
    public Boolean getHasData() { return hasData; }
    public void setHasData(Boolean hasData) { this.hasData = hasData; }
    public Long getCount() { return count; }
    public void setCount(Long count) { this.count = count; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
