import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/services/ruleset-service.js';

test('sanitizeCustomRule falls back to semantic_llm when evaluatorType is missing', () => {
  const sanitized = __testUtils.sanitizeCustomRule({
    id: 'rule-1',
    name: 'User Value Check',
    checkDescription: 'Prueft den User Value',
    severity: 'critical',
    example: '',
  });

  assert.equal(
    sanitized.evaluatorType,
    __testUtils.DEFAULT_CUSTOM_RULE_EVALUATOR_TYPE
  );
});

test('sanitizeCustomRule keeps a valid evaluatorType', () => {
  const sanitized = __testUtils.sanitizeCustomRule({
    id: 'rule-2',
    name: 'Semantik mit LLM',
    checkDescription: 'Prueft semantisch mit LLM',
    severity: 'warning',
    example: '',
    evaluatorType: 'semantic_llm',
  });

  assert.equal(sanitized.evaluatorType, 'semantic_llm');
});

test('sanitizeCustomRule falls back to auto scope when scope is missing', () => {
  const sanitized = __testUtils.sanitizeCustomRule({
    id: 'rule-2b',
    name: 'Titel klar',
    checkDescription: 'Titel darf nicht generisch sein.',
    severity: 'warning',
    evaluatorType: 'deterministic',
  });

  assert.equal(sanitized.scope, __testUtils.DEFAULT_CUSTOM_RULE_SCOPE);
});

test('sanitizeCustomRule keeps a valid scope', () => {
  const sanitized = __testUtils.sanitizeCustomRule({
    id: 'rule-2c',
    name: 'Titel klar',
    checkDescription: 'Titel darf nicht generisch sein.',
    severity: 'warning',
    evaluatorType: 'deterministic',
    scope: 'title',
  });

  assert.equal(sanitized.scope, 'title');
});

test('validateCustomRuleset rejects invalid evaluatorType values', () => {
  assert.throws(() => {
    __testUtils.validateCustomRuleset({
      id: 'custom-ruleset-1',
      name: 'Meine Regeln',
      rules: [
        {
          id: 'rule-3',
          name: 'Invalid Evaluator',
          checkDescription: 'Test',
          severity: 'warning',
          evaluatorType: 'unsupported_mode',
        },
      ],
    });
  }, /evaluator type is invalid/i);
});

test('validateCustomRuleset rejects invalid scope values', () => {
  assert.throws(() => {
    __testUtils.validateCustomRuleset({
      id: 'custom-ruleset-1b',
      name: 'Meine Regeln',
      rules: [
        {
          id: 'rule-3b',
          name: 'Invalid Scope',
          checkDescription: 'Test',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          scope: 'invalid_scope',
        },
      ],
    });
  }, /scope is invalid/i);
});

test('applyCustomRulesetUpdate replaces an existing ruleset and preserves createdAt', () => {
  const originalCreatedAt = 1700000000000;
  const current = [
    {
      id: 'ruleset-to-update',
      name: 'Original name',
      description: 'Original description',
      appliesTo: ['Story'],
      createdAt: originalCreatedAt,
      rules: [
        {
          id: 'rule-1',
          name: 'Original rule',
          checkDescription: 'Original check',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          scope: 'auto',
          example: '',
        },
      ],
    },
  ];

  const next = __testUtils.applyCustomRulesetUpdate(current, {
    id: 'ruleset-to-update',
    name: 'Updated name',
    description: 'Updated description',
    appliesTo: ['Story', 'Bug'],
    createdAt: 9999999999999,
    rules: [
      {
        id: 'rule-1',
        name: 'Updated rule',
        checkDescription: 'Updated check',
        severity: 'critical',
        evaluatorType: 'semantic_llm',
        scope: 'main_description',
        example: 'Updated example',
      },
    ],
  });

  assert.equal(next.length, 1);
  const updated = next[0];
  assert.equal(updated.id, 'ruleset-to-update');
  assert.equal(updated.name, 'Updated name');
  assert.equal(updated.description, 'Updated description');
  assert.deepEqual(updated.appliesTo, ['Story', 'Bug']);
  assert.equal(updated.createdAt, originalCreatedAt, 'createdAt must be preserved on edit');
  assert.equal(updated.rules[0].name, 'Updated rule');
  assert.equal(updated.rules[0].checkDescription, 'Updated check');
  assert.equal(updated.rules[0].severity, 'critical');
  assert.equal(updated.rules[0].scope, 'main_description');
  assert.equal(updated.rules[0].example, 'Updated example');
});

test('applyCustomRulesetUpdate rejects an unknown ruleset id', () => {
  assert.throws(
    () =>
      __testUtils.applyCustomRulesetUpdate([], {
        id: 'does-not-exist',
        name: 'Anything',
        description: '',
        appliesTo: ['Story'],
        createdAt: Date.now(),
        rules: [
          {
            id: 'r',
            name: 'r',
            checkDescription: 'r',
            severity: 'warning',
            evaluatorType: 'semantic_llm',
            scope: 'auto',
            example: '',
          },
        ],
      }),
    /does not exist/i
  );
});

test('applyCustomRulesetUpdate leaves other rulesets untouched', () => {
  const current = [
    {
      id: 'keep-me',
      name: 'Keep Me',
      description: '',
      appliesTo: ['Story'],
      createdAt: 1,
      rules: [
        {
          id: 'k',
          name: 'Keep rule',
          checkDescription: 'Keep',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          scope: 'auto',
          example: '',
        },
      ],
    },
    {
      id: 'change-me',
      name: 'Change Me',
      description: '',
      appliesTo: ['Story'],
      createdAt: 2,
      rules: [
        {
          id: 'c',
          name: 'Change rule',
          checkDescription: 'Change',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          scope: 'auto',
          example: '',
        },
      ],
    },
  ];

  const next = __testUtils.applyCustomRulesetUpdate(current, {
    id: 'change-me',
    name: 'Changed!',
    description: '',
    appliesTo: ['Story'],
    createdAt: Date.now(),
    rules: [
      {
        id: 'c',
        name: 'Changed rule',
        checkDescription: 'Changed',
        severity: 'warning',
        evaluatorType: 'semantic_llm',
        scope: 'auto',
        example: '',
      },
    ],
  });

  assert.equal(next.length, 2);
  const keepMe = next.find(r => r.id === 'keep-me');
  const changed = next.find(r => r.id === 'change-me');
  assert.equal(keepMe.name, 'Keep Me', 'untouched ruleset must keep its name');
  assert.equal(keepMe.createdAt, 1);
  assert.equal(changed.name, 'Changed!');
  assert.equal(changed.createdAt, 2, 'edited ruleset must keep its original createdAt');
});

test('applyCustomRulesetUpdate rejects a payload that fails validation', () => {
  const current = [
    {
      id: 'rs-1',
      name: 'RS',
      description: '',
      appliesTo: ['Story'],
      createdAt: 1,
      rules: [
        {
          id: 'r',
          name: 'r',
          checkDescription: 'r',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          scope: 'auto',
          example: '',
        },
      ],
    },
  ];

  // empty rules array must be rejected by the existing validator
  assert.throws(
    () =>
      __testUtils.applyCustomRulesetUpdate(current, {
        id: 'rs-1',
        name: 'RS',
        description: '',
        appliesTo: ['Story'],
        createdAt: 1,
        rules: [],
      }),
    /at least one rule/i
  );
});

test('sanitizeCustomRuleset applies evaluator fallback to every custom rule', () => {
  const sanitizedRuleset = __testUtils.sanitizeCustomRuleset({
    id: 'custom-ruleset-2',
    name: 'Gemischte Regeln',
    rules: [
      {
        id: 'rule-4',
        name: 'Legacy ohne evaluator',
        checkDescription: 'Legacy',
        severity: 'warning',
      },
      {
        id: 'rule-5',
        name: 'Neue Regel',
        checkDescription: 'Neu',
        severity: 'critical',
        evaluatorType: 'semantic_heuristic',
      },
    ],
  });

  assert.equal(
    sanitizedRuleset.rules[0].evaluatorType,
    __testUtils.DEFAULT_CUSTOM_RULE_EVALUATOR_TYPE
  );
  assert.equal(sanitizedRuleset.rules[1].evaluatorType, 'semantic_llm');
});
