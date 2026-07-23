package com.smartcare.backend.entity;

public class TransfusionItem {
    private BloodProductSnapshot product;
    private String receiveAt;
    private AccountSignature receiver;
    private VitalSigns preVitals;
    private String appearance;
    private String crossMatch;
    private String deviceQualified;
    private String salineBefore;
    private String identityMatched;
    private AccountSignature bedsideVerifier1;
    private AccountSignature bedsideVerifier2;
    private String startAt;
    private String slowReaction;
    private AccountSignature slowReactionSigner;
    private VitalSigns after15Vitals;
    private String dripRate;
    private String duringReaction;
    private AccountSignature duringReactionSigner;
    private String salineAfter;
    private String harmlessDisposal;
    private VitalSigns postVitals;
    private String endAt;
    private AccountSignature endSigner;
    private String adverseReaction;
    private AccountSignature recorder;

    public BloodProductSnapshot getProduct() { return product; }
    public void setProduct(BloodProductSnapshot product) { this.product = product; }
    public String getReceiveAt() { return receiveAt; }
    public void setReceiveAt(String receiveAt) { this.receiveAt = receiveAt; }
    public AccountSignature getReceiver() { return receiver; }
    public void setReceiver(AccountSignature receiver) { this.receiver = receiver; }
    public VitalSigns getPreVitals() { return preVitals; }
    public void setPreVitals(VitalSigns preVitals) { this.preVitals = preVitals; }
    public String getAppearance() { return appearance; }
    public void setAppearance(String appearance) { this.appearance = appearance; }
    public String getCrossMatch() { return crossMatch; }
    public void setCrossMatch(String crossMatch) { this.crossMatch = crossMatch; }
    public String getDeviceQualified() { return deviceQualified; }
    public void setDeviceQualified(String deviceQualified) { this.deviceQualified = deviceQualified; }
    public String getSalineBefore() { return salineBefore; }
    public void setSalineBefore(String salineBefore) { this.salineBefore = salineBefore; }
    public String getIdentityMatched() { return identityMatched; }
    public void setIdentityMatched(String identityMatched) { this.identityMatched = identityMatched; }
    public AccountSignature getBedsideVerifier1() { return bedsideVerifier1; }
    public void setBedsideVerifier1(AccountSignature bedsideVerifier1) { this.bedsideVerifier1 = bedsideVerifier1; }
    public AccountSignature getBedsideVerifier2() { return bedsideVerifier2; }
    public void setBedsideVerifier2(AccountSignature bedsideVerifier2) { this.bedsideVerifier2 = bedsideVerifier2; }
    public String getStartAt() { return startAt; }
    public void setStartAt(String startAt) { this.startAt = startAt; }
    public String getSlowReaction() { return slowReaction; }
    public void setSlowReaction(String slowReaction) { this.slowReaction = slowReaction; }
    public AccountSignature getSlowReactionSigner() { return slowReactionSigner; }
    public void setSlowReactionSigner(AccountSignature slowReactionSigner) { this.slowReactionSigner = slowReactionSigner; }
    public VitalSigns getAfter15Vitals() { return after15Vitals; }
    public void setAfter15Vitals(VitalSigns after15Vitals) { this.after15Vitals = after15Vitals; }
    public String getDripRate() { return dripRate; }
    public void setDripRate(String dripRate) { this.dripRate = dripRate; }
    public String getDuringReaction() { return duringReaction; }
    public void setDuringReaction(String duringReaction) { this.duringReaction = duringReaction; }
    public AccountSignature getDuringReactionSigner() { return duringReactionSigner; }
    public void setDuringReactionSigner(AccountSignature duringReactionSigner) { this.duringReactionSigner = duringReactionSigner; }
    public String getSalineAfter() { return salineAfter; }
    public void setSalineAfter(String salineAfter) { this.salineAfter = salineAfter; }
    public String getHarmlessDisposal() { return harmlessDisposal; }
    public void setHarmlessDisposal(String harmlessDisposal) { this.harmlessDisposal = harmlessDisposal; }
    public VitalSigns getPostVitals() { return postVitals; }
    public void setPostVitals(VitalSigns postVitals) { this.postVitals = postVitals; }
    public String getEndAt() { return endAt; }
    public void setEndAt(String endAt) { this.endAt = endAt; }
    public AccountSignature getEndSigner() { return endSigner; }
    public void setEndSigner(AccountSignature endSigner) { this.endSigner = endSigner; }
    public String getAdverseReaction() { return adverseReaction; }
    public void setAdverseReaction(String adverseReaction) { this.adverseReaction = adverseReaction; }
    public AccountSignature getRecorder() { return recorder; }
    public void setRecorder(AccountSignature recorder) { this.recorder = recorder; }
}
