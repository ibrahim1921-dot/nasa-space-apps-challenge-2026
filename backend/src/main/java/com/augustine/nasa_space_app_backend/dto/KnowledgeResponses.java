package com.augustine.nasa_space_app_backend.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Plain-text educational API allowlist; never serialize editorial/database rows. */
public final class KnowledgeResponses {
 private KnowledgeResponses() { }
 public record Reference(String code,String title,String publisher,String url,LocalDate verifiedAt) { }
 public record Media(UUID id,String filename,String mediaType,String assetPath,String altText,
                     String sourceCredit,String reviewStatus,boolean available) { }
 public record Review(String method,Instant reviewedAt,String note) { }
 public record Card(String code,String indicatorCode,String title,String introduction,int version,
                    String disclaimer,Review review,List<Media> media) { }
 public record Section(String kind,String title,String body,int position,List<Reference> references) { }
 public record Finding(String code,String indicatorCode,String metricCode,String unit,String title,String meaning) { }
 public record Countermeasure(String code,String title,String summary,String body,String authorizationNote,
                              int version,String contentFormat,Review review,List<String> indicatorCodes,
                              List<Finding> findings,List<Reference> references,List<Media> media) { }
 public record Topic(Card topic,String contentFormat,List<Section> sections,
                     List<Countermeasure> countermeasures,List<Reference> references) { }
}
