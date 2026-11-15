package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.KnowledgeResponses.*;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.sql.*;
import java.util.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class KnowledgeService {
 private final JdbcTemplate jdbc;
 private final AuthService auth;
 public KnowledgeService(JdbcTemplate jdbc,AuthService auth) { this.jdbc=jdbc;this.auth=auth; }
 private void identity() {
  var a=SecurityContextHolder.getContext().getAuthentication();
  if(a==null || !(a.getPrincipal() instanceof AccountPrincipal p) || !a.isAuthenticated())
   throw new AuthenticationCredentialsNotFoundException("Authentication required.");
  auth.currentIdentity(p.accountId());
 }
 private void code(String code) {
  if(code==null || !code.matches("[a-z][a-z0-9_-]{0,119}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid knowledge catalog code.");
 }
 private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"Published educational content not found."); }
 private Review review(ResultSet r) throws SQLException {
  return new Review("SOURCE_VERIFICATION_NOT_CLINICAL_CERTIFICATION",r.getTimestamp("reviewed_at").toInstant(),r.getString("review_note"));
 }
 private List<Media> media(String column,String code) {
  return jdbc.query("SELECT id,filename,media_type,asset_path,alt_text,source_credit,review_status FROM knowledge_media WHERE "+column+"=? ORDER BY position,id",
   (r,n)->new Media(r.getObject("id",UUID.class),r.getString("filename"),r.getString("media_type"),r.getString("asset_path"),r.getString("alt_text"),r.getString("source_credit"),r.getString("review_status"),"APPROVED".equals(r.getString("review_status"))),code);
 }
 private Card card(ResultSet r) throws SQLException {
  String code=r.getString("code");
  return new Card(code,r.getString("indicator_code"),r.getString("title"),r.getString("introduction"),r.getInt("version"),r.getString("disclaimer"),review(r),media("topic_code",code));
 }
 public List<Card> topics() {
  identity();
  return jdbc.query("SELECT code,indicator_code,title,introduction,version,disclaimer,reviewed_at,review_note FROM knowledge_topics WHERE status='PUBLISHED' ORDER BY code",(r,n)->card(r));
 }
 private Card published(String code) {
  code(code);
  var rows=jdbc.query("SELECT code,indicator_code,title,introduction,version,disclaimer,reviewed_at,review_note FROM knowledge_topics WHERE code=? AND status='PUBLISHED'",(r,n)->card(r),code);
  if(rows.isEmpty()) throw missing();return rows.get(0);
 }
 private List<Reference> references(String column,String code,String section) {
  String filter=section==null?"":" AND c.section_kind=?";
  Object[] args=section==null?new Object[]{code}:new Object[]{code,section};
  return jdbc.query("SELECT DISTINCT r.code,r.title,r.publisher,r.url,r.verified_at FROM knowledge_references r JOIN knowledge_citations c ON c.reference_code=r.code WHERE c."+column+"=?"+filter+" ORDER BY r.code",
   (r,n)->new Reference(r.getString("code"),r.getString("title"),r.getString("publisher"),r.getString("url"),r.getDate("verified_at").toLocalDate()),args);
 }
 private List<Section> sectionRows(String code) {
  return jdbc.query("SELECT kind,title,body,position FROM knowledge_sections WHERE topic_code=? ORDER BY position",
   (r,n)->new Section(r.getString("kind"),r.getString("title"),r.getString("body"),r.getInt("position"),references("topic_code",code,r.getString("kind"))),code);
 }
 public Topic topic(String code) {
  identity();Card card=published(code);
  return new Topic(card,"PLAIN_TEXT",sectionRows(code),countermeasureRows(card.indicatorCode(),null),references("topic_code",code,null));
 }
 public List<Section> sections(String code) { identity();published(code);return sectionRows(code); }
 public Section section(String code,String kind) {
  identity();published(code);
  if(!Set.of("MEASURES","MONITORING","MEASUREMENT","SPACEFLIGHT","COUNTERMEASURES","REFERENCES").contains(kind)) throw missing();
  return sectionRows(code).stream().filter(s->s.kind().equals(kind)).findFirst().orElseThrow(this::missing);
 }
 private Finding finding(ResultSet r) throws SQLException {
  return new Finding(r.getString("code"),r.getString("indicator_code"),r.getString("metric_code"),r.getString("unit"),r.getString("title"),r.getString("meaning"));
 }
 public List<Finding> findings() {
  identity();
  return jdbc.query("SELECT f.code,f.indicator_code,f.metric_code,f.unit,f.title,f.meaning FROM knowledge_assessment_findings f WHERE EXISTS(SELECT 1 FROM knowledge_finding_countermeasures x JOIN knowledge_countermeasures c ON c.code=x.countermeasure_code WHERE x.finding_code=f.code AND c.status='PUBLISHED') ORDER BY f.code",(r,n)->finding(r));
 }
 private Countermeasure countermeasure(ResultSet r) throws SQLException {
  String code=r.getString("code");
  return new Countermeasure(code,r.getString("title"),r.getString("summary"),r.getString("body"),r.getString("authorization_note"),r.getInt("version"),"PLAIN_TEXT",review(r),
   jdbc.queryForList("SELECT indicator_code FROM knowledge_countermeasure_indicators WHERE countermeasure_code=? ORDER BY indicator_code",String.class,code),
   jdbc.query("SELECT f.code,f.indicator_code,f.metric_code,f.unit,f.title,f.meaning FROM knowledge_assessment_findings f JOIN knowledge_finding_countermeasures x ON x.finding_code=f.code WHERE x.countermeasure_code=? ORDER BY f.code",(f,n)->finding(f),code),
   references("countermeasure_code",code,null),media("countermeasure_code",code));
 }
 private List<Countermeasure> countermeasureRows(String indicator,String finding) {
  return jdbc.query("SELECT c.code,c.title,c.summary,c.body,c.authorization_note,c.version,c.reviewed_at,c.review_note FROM knowledge_countermeasures c WHERE c.status='PUBLISHED'"
   +" AND (?::text IS NULL OR EXISTS(SELECT 1 FROM knowledge_countermeasure_indicators i WHERE i.countermeasure_code=c.code AND i.indicator_code=?))"
   +" AND (?::text IS NULL OR EXISTS(SELECT 1 FROM knowledge_finding_countermeasures f WHERE f.countermeasure_code=c.code AND f.finding_code=? AND (?::text IS NULL OR f.indicator_code=?))) ORDER BY c.code",
   (r,n)->countermeasure(r),indicator,indicator,finding,finding,indicator,indicator);
 }
 public List<Countermeasure> countermeasures(String indicator,String finding) {
  identity();
  if(indicator!=null) {
   code(indicator);
   if(jdbc.queryForObject("SELECT count(*) FROM health_indicators WHERE code=?",Integer.class,indicator)==0) throw missing();
  }
  if(finding!=null) {
   code(finding);
   if(jdbc.queryForObject("SELECT count(*) FROM knowledge_assessment_findings WHERE code=?",Integer.class,finding)==0) throw missing();
  }
  return countermeasureRows(indicator,finding);
 }
 public Countermeasure countermeasure(String code) {
  identity();code(code);
  var rows=jdbc.query("SELECT code,title,summary,body,authorization_note,version,reviewed_at,review_note FROM knowledge_countermeasures WHERE code=? AND status='PUBLISHED'",(r,n)->countermeasure(r),code);
  if(rows.isEmpty()) throw missing();return rows.get(0);
 }
}
