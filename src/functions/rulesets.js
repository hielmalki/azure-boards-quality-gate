import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { assertAdmin } from '../auth/require-admin.js';
import { getAuthContext } from '../auth/auth-context.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import {
  createCustomRuleset,
  deleteCustomRuleset,
  getRulesetsState,
  saveActiveRulesets,
  updateCustomRuleset,
} from '../services/ruleset-service.js';
import { logError, logInfo } from '../utils/logger.js';

const getRulesetsStateHandler = withAuth(async (request, context) => {
  try {
    const state = await getRulesetsState();
    logInfo('rulesets.state.loaded', {
      activeRulesetCount: state.activeRulesetIds.length,
      customRulesetCount: state.customRulesets.length,
    });
    return { jsonBody: state };
  } catch (error) {
    logError('rulesets.state.load_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'RULESETS_STATE_LOAD_FAILED' });
  }
});

const saveActiveRulesetsHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    await assertAdmin();
    const state = await saveActiveRulesets(body.activeRulesetIds, getAuthContext()?.userId ?? null);
    logInfo('rulesets.active.saved', {
      activeRulesetIds: state.activeRulesetIds,
      activeRulesetCount: state.activeRulesetIds.length,
    });
    return { jsonBody: state };
  } catch (error) {
    logError('rulesets.active.save_failed', error, {
      requestedRulesetCount: Array.isArray(body?.activeRulesetIds) ? body.activeRulesetIds.length : 0,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'RULESETS_ACTIVE_SAVE_FAILED' });
  }
});

const createCustomRulesetHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    await assertAdmin();
    const state = await createCustomRuleset(body.ruleset);
    logInfo('rulesets.custom.created', {
      customRulesetCount: state.customRulesets.length,
      createdRulesetId: body?.ruleset?.id ?? null,
    });
    return { jsonBody: state };
  } catch (error) {
    logError('rulesets.custom.create_failed', error, { requestedRulesetId: body?.ruleset?.id ?? null });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'RULESET_CREATE_FAILED' });
  }
});

const updateCustomRulesetHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);
  const ruleset = { ...body.ruleset, id: request.params.id };

  try {
    await assertAdmin();
    const state = await updateCustomRuleset(ruleset);
    logInfo('rulesets.custom.updated', {
      customRulesetCount: state.customRulesets.length,
      updatedRulesetId: ruleset.id,
    });
    return { jsonBody: state };
  } catch (error) {
    logError('rulesets.custom.update_failed', error, { requestedRulesetId: ruleset.id });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'RULESET_UPDATE_FAILED' });
  }
});

const deleteCustomRulesetHandler = withAuth(async (request, context) => {
  const rulesetId = request.params.id;

  try {
    await assertAdmin();
    const state = await deleteCustomRuleset(rulesetId, getAuthContext()?.userId ?? null);
    logInfo('rulesets.custom.deleted', {
      deletedRulesetId: rulesetId,
      remainingCustomRulesetCount: state.customRulesets.length,
      activeRulesetCount: state.activeRulesetIds.length,
    });
    return { jsonBody: state };
  } catch (error) {
    logError('rulesets.custom.delete_failed', error, { requestedRulesetId: rulesetId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'RULESET_DELETE_FAILED' });
  }
});

app.http('getRulesetsState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rulesets',
  handler: getRulesetsStateHandler,
});

app.http('saveActiveRulesets', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rulesets/active',
  handler: saveActiveRulesetsHandler,
});

app.http('createCustomRuleset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rulesets/custom',
  handler: createCustomRulesetHandler,
});

app.http('updateCustomRuleset', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'rulesets/custom/{id}',
  handler: updateCustomRulesetHandler,
});

app.http('deleteCustomRuleset', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'rulesets/custom/{id}',
  handler: deleteCustomRulesetHandler,
});

export const __testUtils = {
  getRulesetsStateHandler,
  saveActiveRulesetsHandler,
  createCustomRulesetHandler,
  updateCustomRulesetHandler,
  deleteCustomRulesetHandler,
};
