-- Educational content only. No observations, thresholds, accounts or ML integration.
CREATE TABLE knowledge_topics (
 code TEXT PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9-]{0,79}$'),
 indicator_code TEXT NOT NULL UNIQUE REFERENCES health_indicators(code),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 introduction TEXT NOT NULL CHECK(length(trim(introduction)) BETWEEN 1 AND 600),
 disclaimer TEXT NOT NULL CHECK(length(trim(disclaimer))>40),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_note TEXT,
 CHECK(status='DRAFT' OR (length(trim(reviewed_by))>0 AND reviewed_at IS NOT NULL AND length(trim(review_note))>0))
);
CREATE TABLE knowledge_sections (
 topic_code TEXT NOT NULL REFERENCES knowledge_topics(code),
 kind TEXT NOT NULL CHECK(kind IN ('MEASURES','MONITORING','MEASUREMENT','SPACEFLIGHT','COUNTERMEASURES','REFERENCES')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 12000),
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 6),
 PRIMARY KEY(topic_code,kind), UNIQUE(topic_code,position)
);
CREATE TABLE knowledge_countermeasures (
 code TEXT PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9-]{0,79}$'),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 600),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 12000),
 authorization_note TEXT NOT NULL CHECK(length(trim(authorization_note))>40),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_note TEXT,
 CHECK(status='DRAFT' OR (length(trim(reviewed_by))>0 AND reviewed_at IS NOT NULL AND length(trim(review_note))>0))
);
CREATE TABLE knowledge_references (
 code TEXT PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9-]{0,79}$'),
 title TEXT NOT NULL CHECK(length(trim(title))>0),
 publisher TEXT NOT NULL CHECK(length(trim(publisher))>0),
 url TEXT NOT NULL CHECK(url ~ '^https://[^[:space:]]+$'),
 verified_at DATE NOT NULL, verification_note TEXT NOT NULL CHECK(length(trim(verification_note))>0)
);
CREATE TABLE knowledge_citations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reference_code TEXT NOT NULL REFERENCES knowledge_references(code),
 topic_code TEXT REFERENCES knowledge_topics(code),
 section_kind TEXT,
 countermeasure_code TEXT REFERENCES knowledge_countermeasures(code),
 CHECK(num_nonnulls(topic_code,countermeasure_code)=1),
 CHECK(section_kind IS NULL OR topic_code IS NOT NULL),
 FOREIGN KEY(topic_code,section_kind) REFERENCES knowledge_sections(topic_code,kind),
 UNIQUE NULLS NOT DISTINCT(reference_code,topic_code,section_kind,countermeasure_code)
);
CREATE TABLE knowledge_countermeasure_indicators (
 countermeasure_code TEXT NOT NULL REFERENCES knowledge_countermeasures(code),
 indicator_code TEXT NOT NULL REFERENCES health_indicators(code),
 rationale TEXT NOT NULL CHECK(length(trim(rationale))>0),
 PRIMARY KEY(countermeasure_code,indicator_code)
);
-- Stable, curated finding identifiers are an educational lookup vocabulary, not diagnoses.
CREATE TABLE knowledge_assessment_findings (
 code TEXT PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9-]{0,119}$'),
 indicator_code TEXT NOT NULL, metric_code TEXT NOT NULL, unit TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title))>0),
 meaning TEXT NOT NULL CHECK(length(trim(meaning))>0),
 FOREIGN KEY(indicator_code,metric_code,unit) REFERENCES indicator_metrics(indicator_code,metric_code,unit),
 UNIQUE(code,indicator_code)
);
CREATE TABLE knowledge_finding_countermeasures (
 finding_code TEXT NOT NULL, countermeasure_code TEXT NOT NULL, indicator_code TEXT NOT NULL,
 rationale TEXT NOT NULL CHECK(length(trim(rationale))>0),
 PRIMARY KEY(finding_code,countermeasure_code),
 FOREIGN KEY(finding_code,indicator_code) REFERENCES knowledge_assessment_findings(code,indicator_code),
 FOREIGN KEY(countermeasure_code,indicator_code) REFERENCES knowledge_countermeasure_indicators(countermeasure_code,indicator_code)
);
CREATE TABLE knowledge_media (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 topic_code TEXT REFERENCES knowledge_topics(code), countermeasure_code TEXT REFERENCES knowledge_countermeasures(code),
 CHECK(num_nonnulls(topic_code,countermeasure_code)=1),
 filename TEXT NOT NULL CHECK(filename ~ '^[a-z0-9][a-z0-9._-]+\.(svg|png|jpg|jpeg|webp|mp4|webm)$'),
 media_type TEXT NOT NULL CHECK(media_type IN ('IMAGE','VIDEO')),
 asset_path TEXT NOT NULL CHECK(asset_path ~ '^/media/knowledge/[a-z0-9/_-]+\.(svg|png|jpg|jpeg|webp|mp4|webm)$'),
 alt_text TEXT NOT NULL CHECK(length(trim(alt_text))>0),
 source_credit TEXT NOT NULL CHECK(length(trim(source_credit))>0),
 review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING','APPROVED')),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
 CHECK(review_status='PENDING' OR (reviewed_by IS NOT NULL AND length(trim(reviewed_by))>0 AND reviewed_at IS NOT NULL)),
 CHECK((media_type='IMAGE' AND filename ~ '\.(svg|png|jpg|jpeg|webp)$' AND asset_path ~ '\.(svg|png|jpg|jpeg|webp)$')
    OR (media_type='VIDEO' AND filename ~ '\.(mp4|webm)$' AND asset_path ~ '\.(mp4|webm)$')),
 position INTEGER NOT NULL DEFAULT 1 CHECK(position>0)
);
CREATE INDEX knowledge_media_topic ON knowledge_media(topic_code,position,id);
CREATE INDEX knowledge_media_countermeasure ON knowledge_media(countermeasure_code,position,id);
CREATE INDEX knowledge_citations_topic ON knowledge_citations(topic_code,section_kind);
CREATE INDEX knowledge_citations_countermeasure ON knowledge_citations(countermeasure_code);
CREATE INDEX knowledge_countermeasures_indicator ON knowledge_countermeasure_indicators(indicator_code,countermeasure_code);

-- Database-owner editorial workflow, not an HTTP publishing surface. Withdraw first;
-- publication validates completeness; published text cannot be silently rewritten.
CREATE FUNCTION knowledge_publication_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Withdraw educational content before deletion' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' AND NEW.status='PUBLISHED' THEN
  RAISE EXCEPTION 'Create draft content before publication' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='PUBLISHED' THEN
  IF NEW.status<>'DRAFT' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
   RAISE EXCEPTION 'Withdraw educational content before editing' USING ERRCODE='23514';
  END IF;
  NEW.reviewed_by=NULL; NEW.reviewed_at=NULL; NEW.review_note=NULL;
  NEW.version=OLD.version+1;
 ELSIF TG_OP='UPDATE' AND NEW.status='PUBLISHED' THEN
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review_note IS NULL
   OR length(trim(NEW.reviewed_by))=0 OR length(trim(NEW.review_note))=0 THEN
   RAISE EXCEPTION 'Source verification review is required' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='knowledge_topics' THEN
   IF (SELECT count(*) FROM knowledge_sections WHERE topic_code=NEW.code)<>6
    OR EXISTS(SELECT 1 FROM knowledge_sections s WHERE s.topic_code=NEW.code AND NOT EXISTS
      (SELECT 1 FROM knowledge_citations c WHERE c.topic_code=s.topic_code AND c.section_kind=s.kind))
    OR NOT EXISTS(SELECT 1 FROM knowledge_countermeasure_indicators i JOIN knowledge_countermeasures m ON m.code=i.countermeasure_code
      WHERE i.indicator_code=NEW.indicator_code AND m.status='PUBLISHED') THEN
    RAISE EXCEPTION 'Complete cited sections and published countermeasures are required' USING ERRCODE='23514';
   END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM knowledge_citations WHERE countermeasure_code=NEW.code)
    OR NOT EXISTS(SELECT 1 FROM knowledge_countermeasure_indicators WHERE countermeasure_code=NEW.code) THEN
    RAISE EXCEPTION 'Citations and indicator mappings are required' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_topics_publication BEFORE INSERT OR UPDATE OR DELETE ON knowledge_topics FOR EACH ROW EXECUTE FUNCTION knowledge_publication_guard();
CREATE TRIGGER knowledge_countermeasures_publication BEFORE INSERT OR UPDATE OR DELETE ON knowledge_countermeasures FOR EACH ROW EXECUTE FUNCTION knowledge_publication_guard();

CREATE FUNCTION knowledge_child_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_row JSONB; new_row JSONB; parent TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN old_row=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row=to_jsonb(NEW); END IF;
 -- Lock all old/new parents to serialize child edits against publication.
 FOR parent IN SELECT DISTINCT v FROM (VALUES(old_row->>'topic_code'),(new_row->>'topic_code')) x(v) WHERE v IS NOT NULL ORDER BY v LOOP
  PERFORM 1 FROM knowledge_topics WHERE code=parent AND status='DRAFT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdraw topic before editing its content' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR parent IN SELECT DISTINCT v FROM (VALUES(old_row->>'countermeasure_code'),(new_row->>'countermeasure_code')) x(v) WHERE v IS NOT NULL ORDER BY v LOOP
  PERFORM 1 FROM knowledge_countermeasures WHERE code=parent AND status='DRAFT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdraw countermeasure before editing its content' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['knowledge_sections','knowledge_citations','knowledge_countermeasure_indicators','knowledge_finding_countermeasures','knowledge_media'] LOOP
  EXECUTE format('CREATE TRIGGER knowledge_review_edit BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION knowledge_child_guard()',tab);
 END LOOP;
END $$;
-- Referenced citations and finding meanings are immutable; replace with a new stable code.
CREATE FUNCTION knowledge_catalog_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Create a new citation or finding code instead of rewriting reviewed meaning' USING ERRCODE='23514'; END $$;
CREATE TRIGGER knowledge_references_immutable BEFORE UPDATE OR DELETE ON knowledge_references FOR EACH ROW EXECUTE FUNCTION knowledge_catalog_immutable();
CREATE TRIGGER knowledge_findings_immutable BEFORE UPDATE OR DELETE ON knowledge_assessment_findings FOR EACH ROW EXECUTE FUNCTION knowledge_catalog_immutable();

-- Source-checked educational seed set follows. Review denotes source verification,
-- not physician sign-off, NASA endorsement or an individually authorized treatment.
-- BEGIN VERIFIED EDUCATIONAL SEEDS
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('pressure-measurement','Measuring Blood Pressure','MedlinePlus / U.S. National Library of Medicine','https://medlineplus.gov/lab-tests/measuring-blood-pressure/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('temperature-measurement','Temperature measurement','MedlinePlus / U.S. National Library of Medicine','https://medlineplus.gov/ency/article/003400.htm','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('bone-measurement','Bone Density Scan','MedlinePlus / U.S. National Library of Medicine','https://medlineplus.gov/lab-tests/bone-density-scan/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('radiation-units','Measuring Radiation','U.S. Nuclear Regulatory Commission','https://www.nrc.gov/facilities-safety/radiation-protection/radiation-and-its-health-effects/measuring-radiation','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('vital-signs','Vital signs','MedlinePlus / U.S. National Library of Medicine','https://medlineplus.gov/ency/article/002341.htm','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('glucose-measurement','How Do Glucose Monitors Measure Sugar Levels in the Blood?','National Institute of Standards and Technology','https://www.nist.gov/how-do-you-measure-it/how-do-glucose-monitors-measure-sugar-levels-blood','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('sleep-habits','Sleep Deprivation and Deficiency: Healthy Sleep Habits','National Heart, Lung, and Blood Institute','https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('spaceflight-risks','Risks of Human Spaceflight','NASA Human Research Program','https://www.nasa.gov/hrp/risks/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('human-body-space','The Human Body in Space','NASA','https://www.nasa.gov/humans-in-space/the-human-body-in-space/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('spaceflight-hazards','5 Hazards of Human Spaceflight','NASA Human Research Program','https://www.nasa.gov/hrp/hazards/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_references(code,title,publisher,url,verified_at,verification_note) VALUES ('human-health','Fundamentals of Human Health','NASA','https://www.nasa.gov/reference/fundamentals-of-human-health/','2026-11-15','Official source retrieved and checked for the limited educational statements cited here. No NASA endorsement or clinical certification is implied.');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('heart-rate','heart_rate','Heart rate','Explore pulse measurements and why activity context matters.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','MEASURES','What it measures','Heart rate counts heartbeats per minute. It describes rate, not a complete assessment of heart function.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('vital-signs','heart-rate','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','MONITORING','Why monitoring matters','Pulse is a vital sign. Compare readings in their activity and measurement context rather than treating a single number as a diagnosis.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('vital-signs','heart-rate','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','MEASUREMENT','How measurement works','A pulse can be counted manually or measured with a device. This catalog records beats/min and separates resting, sleeping and exercise contexts.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('vital-signs','heart-rate','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','SPACEFLIGHT','Spaceflight effects','Weightlessness changes circulation and cardiovascular function. NASA studies cardiovascular adaptation during spaceflight.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','heart-rate','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','COUNTERMEASURES','General countermeasures','Learn how mission-approved physical conditioning supports cardiovascular performance. Individual exercise intensity and restrictions belong to the medical and training team.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','heart-rate','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('heart-rate','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('vital-signs','heart-rate','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('heart-rate','heart-rate-overview-placeholder.webp','IMAGE','/media/knowledge/heart-rate/heart-rate-overview-placeholder.webp','Pending heart rate measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('heart-rate','heart-rate-explainer-placeholder.mp4','VIDEO','/media/knowledge/heart-rate/heart-rate-explainer-placeholder.mp4','Pending heart rate measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('blood-pressure','blood_pressure','Blood pressure','Understand the paired pressure readings used to describe circulation.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','MEASURES','What it measures','Blood pressure describes pressure in arteries. Systolic and diastolic values are a pair, not interchangeable metrics.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('pressure-measurement','blood-pressure','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','MONITORING','Why monitoring matters','Blood pressure is a vital sign used to assess physical function. A reading needs measurement context and clinical interpretation.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('pressure-measurement','blood-pressure','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','MEASUREMENT','How measurement works','A pressure cuff measures systolic and diastolic pressure. The catalog stores both components in mmHg; keep method and activity context with the pair.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('pressure-measurement','blood-pressure','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','SPACEFLIGHT','Spaceflight effects','Microgravity alters blood circulation. Pressure changes should be interpreted by the clinical team in the context of cardiovascular adaptation.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','blood-pressure','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','COUNTERMEASURES','General countermeasures','Preserve paired readings and measurement context. Discuss mission-approved conditioning with the team rather than choosing medication or exercise from a number.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','blood-pressure','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-pressure','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('pressure-measurement','blood-pressure','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('blood-pressure','blood-pressure-overview-placeholder.webp','IMAGE','/media/knowledge/blood-pressure/blood-pressure-overview-placeholder.webp','Pending blood pressure measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('blood-pressure','blood-pressure-explainer-placeholder.mp4','VIDEO','/media/knowledge/blood-pressure/blood-pressure-explainer-placeholder.mp4','Pending blood pressure measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('blood-glucose','blood_sugar','Blood glucose','Learn what glucose readings represent and why device method matters.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','MEASURES','What it measures','Glucose monitoring measures sugar concentration. A blood sample and an interstitial-fluid sensor do not measure the same compartment directly.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('glucose-measurement','blood-glucose','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','MONITORING','Why monitoring matters','Measurements help describe glucose patterns. Device method and timing belong with the reading; an isolated value does not establish a diagnosis.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('glucose-measurement','blood-glucose','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','MEASUREMENT','How measurement works','Finger-stick meters analyze a small blood sample. Continuous sensors estimate glucose in fluid around cells. This catalog uses mmol/L and should retain the measurement method.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('glucose-measurement','blood-glucose','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','SPACEFLIGHT','Spaceflight effects','Spaceflight creates food, nutrition and workload challenges. A specific direction or size of glucose change is not asserted here and requires specialist editorial review.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','blood-glucose','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','COUNTERMEASURES','General countermeasures','Record measurement method and relevant context for the medical team. Follow the existing individual nutrition plan; this page does not recommend insulin, supplements or dietary changes.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('glucose-measurement','blood-glucose','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('blood-glucose','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('glucose-measurement','blood-glucose','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('blood-glucose','blood-glucose-overview-placeholder.webp','IMAGE','/media/knowledge/blood-glucose/blood-glucose-overview-placeholder.webp','Pending blood glucose measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('blood-glucose','blood-glucose-explainer-placeholder.mp4','VIDEO','/media/knowledge/blood-glucose/blood-glucose-explainer-placeholder.mp4','Pending blood glucose measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('temperature','body_temperature','Body temperature','See how temperature measurements fit into a broader health assessment.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','MEASURES','What it measures','Body temperature is a vital sign reflecting the body thermal state. A reading alone does not identify its cause.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('temperature-measurement','temperature','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','MONITORING','Why monitoring matters','Temperature contributes to assessment of physical function. Use it with symptoms, context and the authorized clinical evaluation.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('temperature-measurement','temperature','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','MEASUREMENT','How measurement works','A thermometer measures temperature at a defined site using a specific method. The catalog uses Cel; comparisons should preserve the method and site.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('temperature-measurement','temperature','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','SPACEFLIGHT','Spaceflight effects','Spaceflight involves a controlled but demanding environment. No universal spaceflight-related temperature shift is claimed; indicator-specific effects remain pending specialist review.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-hazards','temperature','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','COUNTERMEASURES','General countermeasures','Record method, site and context and follow established medical reporting procedures. This page does not advise cooling protocols, fluids or medication doses.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('vital-signs','temperature','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('temperature','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('temperature-measurement','temperature','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('temperature','temperature-overview-placeholder.webp','IMAGE','/media/knowledge/temperature/temperature-overview-placeholder.webp','Pending body temperature measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('temperature','temperature-explainer-placeholder.mp4','VIDEO','/media/knowledge/temperature/temperature-explainer-placeholder.mp4','Pending body temperature measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('sleep','sleep_hours','Sleep','Understand sleep duration, schedules and the limits of a duration metric.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','MEASURES','What it measures','Sleep duration describes time asleep during a recorded session. It is not a complete measure of sleep quality or a sleep-disorder diagnosis.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','MONITORING','Why monitoring matters','Sleep supports health and well-being. Repeated short or disrupted sleep deserves discussion with the responsible team.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','MEASUREMENT','How measurement works','A sleep record can combine a log and an approved monitoring method. This backend records session start, end and asleep time, with duration expressed in hours.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','SPACEFLIGHT','Spaceflight effects','NASA identifies sleep loss, circadian disruption and work overload as risks to performance and health.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','sleep','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','COUNTERMEASURES','General countermeasures','Regular sleep timing and a quiet, dark sleep environment are general sleep-support strategies. Mission schedules and any light or medication intervention need team approval.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('sleep','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('sleep','sleep-overview-placeholder.webp','IMAGE','/media/knowledge/sleep/sleep-overview-placeholder.webp','Pending sleep measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('sleep','sleep-explainer-placeholder.mp4','VIDEO','/media/knowledge/sleep/sleep-explainer-placeholder.mp4','Pending sleep measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('mood','mood','Mood and well-being','Explore self-reported well-being without treating a score as a diagnosis.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','MEASURES','What it measures','A mood score summarizes a response on an identified scale. Scores from different scales are not interchangeable.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','mood','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','MONITORING','Why monitoring matters','Self-reports can support conversations about well-being. A numerical score cannot replace a confidential assessment.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','mood','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','MEASUREMENT','How measurement works','Record the scale name, version and response context. Synthetic demonstration scores are not validated astronaut self-assessments or clinical screening tools.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','mood','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','SPACEFLIGHT','Spaceflight effects','Isolation and confinement can affect behavioral health and team functioning during spaceflight.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-hazards','mood','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','COUNTERMEASURES','General countermeasures','Learn about maintaining communication and using the mission behavioral-support system. An app score should not determine counseling, fitness for duty or treatment.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','mood','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('mood','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-health','mood','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('mood','mood-overview-placeholder.webp','IMAGE','/media/knowledge/mood/mood-overview-placeholder.webp','Pending mood and well-being measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('mood','mood-explainer-placeholder.mp4','VIDEO','/media/knowledge/mood/mood-explainer-placeholder.mp4','Pending mood and well-being measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('muscle-health','muscle','Muscle health','Keep strength measurements distinct from measurements of muscle mass.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','MEASURES','What it measures','Grip strength measures force, while muscle mass describes tissue amount. The catalog keeps grip_strength in kgf and muscle_mass in kg as separate metrics.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-body-space','muscle-health','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','MONITORING','Why monitoring matters','Following strength and mass can help describe physical capability. Different test protocols or body sites should not be merged into a single trend.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-body-space','muscle-health','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','MEASUREMENT','How measurement works','Grip testing uses a force-measurement protocol; muscle-mass assessment uses its own method. Preserve body site, protocol and units for each result.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-body-space','muscle-health','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','SPACEFLIGHT','Spaceflight effects','Reduced loading in microgravity can reduce muscle size and strength. NASA studies exercise countermeasures for this risk.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','muscle-health','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','COUNTERMEASURES','General countermeasures','Learn why mission-approved resistance and aerobic training are used. Loads, technique and restrictions must be individually authorized, not generated from a finding label.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','muscle-health','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('muscle-health','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-body-space','muscle-health','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('muscle-health','muscle-health-overview-placeholder.webp','IMAGE','/media/knowledge/muscle-health/muscle-health-overview-placeholder.webp','Pending muscle health measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('muscle-health','muscle-health-explainer-placeholder.mp4','VIDEO','/media/knowledge/muscle-health/muscle-health-explainer-placeholder.mp4','Pending muscle health measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('bone-density','bone_mineral_density','Bone density','Explore slow-cadence bone measurements and their site-specific meaning.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','MEASURES','What it measures','Areal bone mineral density describes mineral amount per projected area. This catalog stores g/cm2 for a defined site and protocol.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('bone-measurement','bone-density','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','MONITORING','Why monitoring matters','Bone measurements contribute to assessment of skeletal health. They should be compared at appropriate intervals using compatible methods.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('bone-measurement','bone-density','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','MEASUREMENT','How measurement works','Bone density is assessed using dedicated imaging methods. Keep the examination site and protocol; a frequent pulse reading and a bone examination have very different cadences.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('bone-measurement','bone-density','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','SPACEFLIGHT','Spaceflight effects','Reduced mechanical loading during spaceflight can contribute to bone loss. Bone health remains a focus of NASA countermeasure research.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','bone-density','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','COUNTERMEASURES','General countermeasures','Learn about the role of mission-approved exercise and nutrition planning. Do not start calcium, vitamin D, medication or additional exercise based on this educational page.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-risks','bone-density','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('bone-density','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('bone-measurement','bone-density','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('bone-density','bone-density-overview-placeholder.webp','IMAGE','/media/knowledge/bone-density/bone-density-overview-placeholder.webp','Pending bone density measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('bone-density','bone-density-explainer-placeholder.mp4','VIDEO','/media/knowledge/bone-density/bone-density-explainer-placeholder.mp4','Pending bone density measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_topics(code,indicator_code,title,introduction,disclaimer) VALUES ('radiation','cumulative_absorbed_radiation_dose','Radiation exposure','Understand cumulative absorbed dose and why its origin matters.','General nonclinical education, not diagnosis, treatment, emergency guidance, or a NASA-approved medical recommendation. General countermeasures do not authorize individual action; follow your flight surgeon and mission-approved procedures. Do not change medication, exercise, diet, or radiation operations based on this content or an automated assessment.');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','MEASURES','What it measures','Absorbed dose is energy deposited per unit mass. This catalog records a personal cumulative total in mGy since a defined accumulation origin.','1');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('radiation-units','radiation','MEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','MONITORING','Why monitoring matters','Exposure tracking supports mission radiation protection. A personal total is distinct from an environmental sensor reading and is not itself a clinical risk estimate.','2');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('radiation-units','radiation','MONITORING');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','MEASUREMENT','How measurement works','Personal dosimetry uses an identified measurement method and origin. Retain the original cumulative total; adding successive totals would double-count exposure. mGy is not interchangeable with mSv.','3');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('radiation-units','radiation','MEASUREMENT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','SPACEFLIGHT','Spaceflight effects','Space radiation is a major exploration hazard. Its effects depend on exposure characteristics; a cumulative scalar cannot summarize the full biological risk.','4');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('human-body-space','radiation','SPACEFLIGHT');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','COUNTERMEASURES','General countermeasures','Learn why radiation monitoring, shielding and operational planning are coordinated by mission specialists. Shelter decisions and exposure constraints require mission authorization.','5');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('spaceflight-hazards','radiation','COUNTERMEASURES');
INSERT INTO knowledge_sections(topic_code,kind,title,body,position) VALUES ('radiation','REFERENCES','References and further reading','Read the linked official sources for context and further reading. Source verification is not a clinical review or an endorsement of this application.','6');
INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('radiation-units','radiation','REFERENCES');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('radiation','radiation-overview-placeholder.webp','IMAGE','/media/knowledge/radiation/radiation-overview-placeholder.webp','Pending radiation exposure measurement overview illustration; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','1');
INSERT INTO knowledge_media(topic_code,filename,media_type,asset_path,alt_text,source_credit,review_status,position) VALUES ('radiation','radiation-explainer-placeholder.mp4','VIDEO','/media/knowledge/radiation/radiation-explainer-placeholder.mp4','Pending radiation exposure measurement and context explainer; no asset supplied','PENDING: no asset selected; source, license and credit require review','PENDING','2');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('measurement-context','Record measurement context','Keep the method, units, timing and activity with a reading.','Use the recorded measurement protocol and preserve original units and context. This is a data-literacy aid, not a request to repeat a test or change treatment.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('vital-signs','measurement-context');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','heart_rate','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','blood_pressure','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','blood_sugar','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','body_temperature','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','sleep_hours','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','mood','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','muscle','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','bone_mineral_density','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('measurement-context','cumulative_absorbed_radiation_dose','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('mission-conditioning','Understand mission-approved conditioning','Learn why physical conditioning is part of crew health support.','NASA uses exercise to counter losses in cardiovascular performance, muscle strength and bone density. Follow the individually authorized program; this entry sets no load, duration, frequency or treatment target.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('spaceflight-risks','mission-conditioning');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('mission-conditioning','heart_rate','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('mission-conditioning','blood_pressure','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('mission-conditioning','muscle','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('mission-conditioning','bone_mineral_density','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('sleep-environment','Support the planned sleep environment','Learn about consistent timing and a quiet, dark sleep environment.','General sleep habits include consistent timing and limiting noise and light around sleep. Coordinate changes with the mission schedule. This entry does not prescribe light therapy, sedatives or a sleep duration target.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('sleep-habits','sleep-environment');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('sleep-environment','sleep_hours','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('sleep-environment','mood','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('behavioral-support','Understand behavioral support','Learn how communication and support fit into mission well-being.','Isolation and confinement are recognized spaceflight stressors. Discuss available communication and behavioral-support resources with the responsible team; a mood score does not select a treatment.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('spaceflight-hazards','behavioral-support');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('behavioral-support','mood','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('behavioral-support','sleep_hours','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('nutrition-planning','Use the authorized nutrition plan','Understand nutrition as part of coordinated crew health support.','NASA studies food and nutrition risks during spaceflight. Individual food, supplement and medication decisions belong to the authorized team. This educational entry does not prescribe carbohydrate, calcium or vitamin D amounts.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('spaceflight-risks','nutrition-planning');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('nutrition-planning','blood_sugar','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('nutrition-planning','muscle','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('nutrition-planning','bone_mineral_density','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_countermeasures(code,title,summary,body,authorization_note) VALUES ('radiation-protection','Understand mission radiation protection','Learn why radiation protection combines monitoring and mission planning.','Space radiation protection is a mission-level concern. Follow authorized monitoring and operational procedures; this entry does not set dose limits or direct shelter, shielding or extravehicular activity decisions.','Educational context only. Any individual exercise, nutrition, treatment, or operational change requires the appropriate medical or mission authorization; this library grants none.');
INSERT INTO knowledge_citations(reference_code,countermeasure_code) VALUES ('spaceflight-hazards','radiation-protection');
INSERT INTO knowledge_countermeasure_indicators(countermeasure_code,indicator_code,rationale) VALUES ('radiation-protection','cumulative_absorbed_radiation_dose','Curated general educational relevance only; not a personalized prescription.');
INSERT INTO knowledge_assessment_findings(code,indicator_code,metric_code,unit,title,meaning) SELECT replace(indicator_code,'_','-')||'-'||replace(metric_code,'_','-')||'-context',indicator_code,metric_code,unit,'Measurement context: '||indicator_code||' / '||metric_code,'Educational context lookup only. Not a diagnosis, abnormality threshold, severity classification, or treatment indication.' FROM indicator_metrics;
INSERT INTO knowledge_finding_countermeasures(finding_code,countermeasure_code,indicator_code,rationale) SELECT f.code,i.countermeasure_code,f.indicator_code,'Explicit curated finding-to-library mapping. Display as general education only; never as an authorized personal recommendation.' FROM knowledge_assessment_findings f JOIN knowledge_countermeasure_indicators i ON i.indicator_code=f.indicator_code;
UPDATE knowledge_countermeasures SET status='PUBLISHED',reviewed_by='phase4f-source-verification',reviewed_at='2026-11-15T00:00:00Z',review_note='Official sources checked on 2026-11-15. Limited nonclinical educational content; no medical certification, NASA endorsement, individual prescription or ML inference.';
UPDATE knowledge_topics SET status='PUBLISHED',reviewed_by='phase4f-source-verification',reviewed_at='2026-11-15T00:00:00Z',review_note='Official sources checked on 2026-11-15. Unverified indicator-specific glucose and temperature spaceflight effects are explicitly held for specialist review rather than asserted.';
