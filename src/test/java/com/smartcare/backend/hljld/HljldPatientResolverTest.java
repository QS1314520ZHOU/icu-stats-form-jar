package com.smartcare.backend.hljld;

import org.bson.Document;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HljldPatientResolver 单元测试。
 */
class HljldPatientResolverTest {

    @Test
    void testStandardizePatient() {
        // 测试患者信息标准化
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        Document patient = new Document();
        patient.put("bedNo", "001");
        patient.put("name", "测试患者");
        patient.put("mrn", "MRN123456");
        patient.put("sex", "Female");
        patient.put("diagnosis", "肺炎；高血压");

        var info = resolver.standardizePatient(patient);

        assertEquals("001", info.get("bedNo"), "床号");
        assertEquals("测试患者", info.get("name"), "姓名");
        assertEquals("MRN123456", info.get("mrn"), "住院号");
        assertEquals("女", info.get("sex"), "性别");
        assertEquals("肺炎", info.get("diagnosis"), "诊断应截断为第一个");
    }

    @Test
    void testStandardizePatientFallback() {
        // 测试患者信息回退字段
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        Document patient = new Document();
        patient.put("hisBed", "002");
        patient.put("patientName", "回退测试");
        patient.put("hospitalNo", "HIS789");
        patient.put("gender", "Male");
        patient.put("clinicalDiagnosis", "冠心病");

        var info = resolver.standardizePatient(patient);

        assertEquals("002", info.get("bedNo"), "床号应从hisBed回退");
        assertEquals("回退测试", info.get("name"), "姓名应从patientName回退");
        assertEquals("HIS789", info.get("mrn"), "住院号应从hospitalNo回退");
        assertEquals("男", info.get("sex"), "性别应从gender回退");
        assertEquals("冠心病", info.get("diagnosis"), "诊断应从clinicalDiagnosis回退");
    }

    @Test
    void testGenderMapping() {
        // 测试性别映射
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        Document patient1 = new Document();
        patient1.put("sex", "Female");
        assertEquals("女", resolver.standardizePatient(patient1).get("sex"));

        Document patient2 = new Document();
        patient2.put("sex", "M");
        assertEquals("男", resolver.standardizePatient(patient2).get("sex"));

        Document patient3 = new Document();
        patient3.put("sex", "男");
        assertEquals("男", resolver.standardizePatient(patient3).get("sex"));
    }

    @Test
    void testNullPatient() {
        // 测试null患者
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        var info = resolver.standardizePatient(null);

        assertEquals("", info.get("bedNo"), "床号应为空");
        assertEquals("未知", info.get("name"), "姓名应为未知");
        assertEquals("", info.get("mrn"), "住院号应为空");
        assertEquals("", info.get("sex"), "性别应为空");
        assertEquals("", info.get("diagnosis"), "诊断应为空");
    }

    @Test
    void testBuildPatientInfo() {
        // 测试构建患者信息字符串
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        Document patient = new Document();
        patient.put("bedNo", "001");
        patient.put("name", "测试");
        patient.put("mrn", "MRN123");
        patient.put("sex", "男");
        patient.put("diagnosis", "肺炎");

        String info = resolver.buildPatientInfo(patient, "65");

        assertTrue(info.contains("床号：001"), "Should contain bed number");
        assertTrue(info.contains("姓名：测试"), "Should contain name");
        assertTrue(info.contains("住院号：MRN123"), "Should contain MRN");
        assertTrue(info.contains("性别：男"), "Should contain gender");
        assertTrue(info.contains("年龄：65"), "Should contain age");
        assertTrue(info.contains("诊断：肺炎"), "Should contain diagnosis");
    }

    @Test
    void testTruncateDiagnosis() {
        // 测试诊断截断
        HljldPatientResolver resolver = new HljldPatientResolver(null);

        Document patient1 = new Document();
        patient1.put("diagnosis", "肺炎；高血压；糖尿病");
        assertEquals("肺炎", resolver.standardizePatient(patient1).get("diagnosis"));

        Document patient2 = new Document();
        patient2.put("diagnosis", "肺炎，高血压");
        assertEquals("肺炎", resolver.standardizePatient(patient2).get("diagnosis"));

        Document patient3 = new Document();
        patient3.put("diagnosis", "单一诊断");
        assertEquals("单一诊断", resolver.standardizePatient(patient3).get("diagnosis"));
    }
}
