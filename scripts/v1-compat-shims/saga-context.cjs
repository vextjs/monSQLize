'use strict';

class SagaContext {
  constructor(sagaId, data) {
    this.sagaId = sagaId;
    this.data = data;
    this.customData = new Map();
    this.completedSteps = [];
    this.stepResults = new Map();
  }

  set(key, value) {
    this.customData.set(key, value);
  }

  get(key) {
    return this.customData.get(key);
  }

  markStepCompleted(stepName, result) {
    this.completedSteps.push(stepName);
    this.stepResults.set(stepName, result);
  }

  getStepResult(stepName) {
    return this.stepResults.get(stepName);
  }

  getCompletedSteps() {
    return [...this.completedSteps];
  }
}

module.exports = SagaContext;
