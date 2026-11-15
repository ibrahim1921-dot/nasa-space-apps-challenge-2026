package com.augustine.nasa_space_app_backend.service;

public class MlProblem extends RuntimeException {
 private final int status;
 public MlProblem(int status,String code) {super(code);this.status=status;}
 public int status() {return status;}
}
