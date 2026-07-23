package com.smartcare.backend.entity;

public class AccountSignature {
    private String accountId;
    private String accountName;

    public AccountSignature() {}
    public AccountSignature(String accountId, String accountName) { this.accountId = accountId; this.accountName = accountName; }
    public String getAccountId() { return accountId; }
    public void setAccountId(String accountId) { this.accountId = accountId; }
    public String getAccountName() { return accountName; }
    public void setAccountName(String accountName) { this.accountName = accountName; }
}
