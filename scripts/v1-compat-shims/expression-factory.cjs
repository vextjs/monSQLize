'use strict';

function createExpression(input) {
  return String(input ?? '').trim();
}

module.exports = { createExpression };
