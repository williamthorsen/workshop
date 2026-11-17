import type { FakeRoutes } from './createFakeRequest.ts';
import { buildStatus, buildWorkflow } from './projectConfiguration.ts';

/** The board of the project that `buildProjectRoutes` serves. */
export const BOARD_ID = 1;

/** The key of the project that `buildProjectRoutes` serves. */
export const PROJECT_KEY = 'PROJ';

const PROJECT_ID = '10000';

/** Builds every route walked by a whole run, against a team-managed project on one workflow. */
export function buildProjectRoutes(): FakeRoutes {
  const statuses = [
    buildStatus({ name: 'To Do', statusCategory: 'TODO', statusReference: 'ref-1' }),
    buildStatus({ name: 'Done', statusCategory: 'DONE', statusReference: 'ref-2' }),
  ];

  return {
    'GET /rest/agile/1.0/board': { json: { values: [{ id: BOARD_ID, name: `${PROJECT_KEY} board` }] } },
    [`GET /rest/agile/1.0/board/${BOARD_ID}/configuration`]: {
      json: {
        columnConfig: {
          columns: [
            { name: 'To Do', statuses: [{ id: 'id-1' }] },
            { name: 'Done', statuses: [{ id: 'id-2' }] },
          ],
        },
      },
    },
    [`GET /rest/agile/1.0/board/${BOARD_ID}/features`]: {
      json: { features: [{ feature: 'jsw.agility.backlog', state: 'DISABLED' }] },
    },
    [`POST /rest/agile/1.0/backlog/${BOARD_ID}/issue`]: { status: 204 },
    [`GET /rest/api/3/project/${PROJECT_KEY}`]: { json: { id: PROJECT_ID, key: PROJECT_KEY, style: 'next-gen' } },
    [`GET /rest/api/3/project/${PROJECT_KEY}/statuses`]: { json: [{ id: '10001' }] },
    'GET /rest/api/3/statuses/search': { json: { values: [] } },
    'POST /rest/api/3/search/jql': { json: { issues: [{ key: 'PROJ-1' }, { key: 'PROJ-2' }] } },
    'POST /rest/api/3/workflows': {
      json: { statuses, workflows: [buildWorkflow(statuses)] },
    },
    'POST /rest/api/3/workflows/update': { json: {} },
    'PUT /rest/api/3/statuses': { json: {} },
  };
}
