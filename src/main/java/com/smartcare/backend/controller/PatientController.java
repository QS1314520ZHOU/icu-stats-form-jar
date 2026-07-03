package com.smartcare.backend.controller;

import com.smartcare.backend.entity.patient.Patient;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/v1/icu/patients"})
@CrossOrigin(origins = {"*"})
public class PatientController {
    private final MongoTemplate mongoTemplate;

    public PatientController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping({""})
    public ResponseEntity<Patient> getById(@RequestParam String id) {
        Query query = new Query(Criteria.where("_id").is(id));
        Patient patient = this.mongoTemplate.findOne(query, Patient.class, "patient");
        return (patient != null) ? ResponseEntity.ok(patient) : ResponseEntity.notFound().build();
    }

    @GetMapping({"/by-mrn"})
    public ResponseEntity<Patient> getByMrn(@RequestParam String mrn) {
        Query query = new Query(Criteria.where("mrn").is(mrn));
        Patient patient = this.mongoTemplate.findOne(query, Patient.class, "patient");
        return (patient != null) ? ResponseEntity.ok(patient) : ResponseEntity.notFound().build();
    }
}
