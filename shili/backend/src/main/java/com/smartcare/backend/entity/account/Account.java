package com.smartcare.backend.entity.account;

import lombok.Data;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * @author yaoniande
 * @date 2026/4/1 11:29
 */
@Data
@Document
public class Account {
    private String id;
    private String username; // 工号
    private String trueName; // 名称
    private String valid; // 有效
    private String departmentCode; // 科室编码
    private String profession; // 职业 (如 Nurse, Doctor)
}
