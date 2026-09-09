package com.smartcare.backend.service;

import com.smartcare.backend.dto.IcuFormAvailabilityResponse;
import com.smartcare.backend.service.formprobe.*;
import java.time.Instant;
import java.util.*;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

@Service
public class IcuFormViewerService {

    /** 允许的 formKey 白名单 */
    private static final Set<String> ALLOWED_FORM_KEYS = new HashSet<>(Arrays.asList(
            "hljldFormPDFNew", "handoverReport",
            "sjm1", "sjmCrrt", "ydwzlForm",
            "toleranceForm", "commitSuicideForm", "IADForm",
            "baetheiForm", "patientFallDangerForm", "bradenForm",
            "jkjyForm", "wpgmForm",
            "ecmoForm", "piccoForm", "iabpForm",
            "crrtForm", "crrtOrderForm", "unPlannedCGZYYForm",
            "transfusionForm"
    ));

    private final Map<String, IcuFormDataProbe> probes = new HashMap<>();

    public IcuFormViewerService(MongoTemplate mongoTemplate) {
        // 护理记录单：多集合综合探测
        probes.put("hljldFormPDFNew", new HljldProbe(mongoTemplate));

        // 交班报告
        probes.put("handoverReport", new HandoverReportProbe(mongoTemplate));

        // 管道维护
        probes.put("sjm1", new TubeExeProbe(mongoTemplate, "sjm1", "中心静脉导管"));
        probes.put("sjmCrrt", new TubeExeProbe(mongoTemplate, "sjmCrrt", "透析管"));

        // 亚低温治疗体温记录单（bedside）
        probes.put("ydwzlForm", new BedsideCodeProbe(mongoTemplate, "ydwzlForm",
                Arrays.asList("param_亚低温体温设置", "param_亚低温水温设置")));

        // 评分表
        probes.put("toleranceForm", new ScoreProbe(mongoTemplate, "toleranceForm", "toleranceScoreV2"));
        probes.put("commitSuicideForm", new ScoreProbe(mongoTemplate, "commitSuicideForm", "commitSuicideScore"));
        probes.put("IADForm", new ScoreProbe(mongoTemplate, "IADForm", "incontinenceScore"));
        probes.put("baetheiForm", new ScoreProbe(mongoTemplate, "baetheiForm", "selfCareAbility"));
        probes.put("patientFallDangerForm", new ScoreProbe(mongoTemplate, "patientFallDangerForm", "patientFallDangerLJRMYY"));
        probes.put("bradenForm", new ScoreProbe(mongoTemplate, "bradenForm", "bradenScore"));
        probes.put("unPlannedCGZYYForm", new ScoreProbe(mongoTemplate, "unPlannedCGZYYForm", "unPlannedCGZYYScore"));

        // 专科治疗 bedside 类
        probes.put("ecmoForm", new BedsideCodeProbe(mongoTemplate, "ecmoForm",
                Arrays.asList("param_ECMOMoShi", "param_ECMO_xueLiuLiang")));
        probes.put("crrtForm", new BedsideCodeProbe(mongoTemplate, "crrtForm",
                Arrays.asList("param_CBP_Mode", "param_血流速度")));
        probes.put("piccoForm", new BedsideCodeProbe(mongoTemplate, "piccoForm",
                Arrays.asList("param_CI(心输出量指数)", "param_GEDI(全心舒张末期容积指数)")));
        probes.put("iabpForm", new BedsideCodeProbe(mongoTemplate, "iabpForm",
                Arrays.asList("param_反博压", "param_iabp心率")));

        // 健康教育
        probes.put("jkjyForm", new HealthEducationProbe(mongoTemplate));

        // CRRT 医嘱单
        probes.put("crrtOrderForm", new CrrtOrderFormProbe(mongoTemplate));

        // 输血记录单
        probes.put("transfusionForm", new TransfusionFormProbe(mongoTemplate));

        // 住院患者物品管理表（客户端数据）
        probes.put("wpgmForm", new ClientSideProbe("wpgmForm"));
    }

    /**
     * 校验 formKey 是否在白名单中。
     */
    public boolean isAllowedFormKey(String formKey) {
        return formKey != null && ALLOWED_FORM_KEYS.contains(formKey);
    }

    /**
     * 检查指定表单在时间范围内是否有数据。
     */
    public IcuFormAvailabilityResponse checkAvailability(String pid, String formKey,
                                                          Instant startTime, Instant endTime) {
        IcuFormDataProbe probe = probes.get(formKey);
        if (probe == null) {
            return IcuFormAvailabilityResponse.error(formKey, "不支持的表单类型");
        }
        return probe.check(pid, startTime, endTime);
    }
}
