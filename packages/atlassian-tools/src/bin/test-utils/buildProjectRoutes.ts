import type { FakeRoutes } from './createFakeRequest.ts';

/** The board of the project that `buildProjectRoutes` serves. */
export const BOARD_ID = 1;

/** The key of the project that `buildProjectRoutes` serves. */
export const PROJECT_KEY = 'PROJ';

const PROJECT_ID = '10000';

/** Builds every route walked by a whole run, against a team-managed project on one workflow. */
export function buildProjectRoutes(): FakeRoutes {
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
      json: {
        statuses: [
          { description: '', id: 'id-1', name: 'To Do', statusCategory: 'TODO', statusReference: 'ref-1' },
          { description: '', id: 'id-2', name: 'Done', statusCategory: 'DONE', statusReference: 'ref-2' },
        ],
        workflows: [buildProjectWorkflow()],
      },
    },
    'POST /rest/api/3/workflows/update': { json: {} },
    'PUT /rest/api/3/statuses': { json: {} },
  };
}

// region | Helpers

/** Builds the workflow graph narrowed by the read, reaching each status through a global transition named for it. */
function buildProjectWorkflow(): unknown {
  return {
    description: 'The project workflow.',
    id: 'workflow-1',
    name: `${PROJECT_KEY}: Software Simplified Workflow`,
    startPointLayout: { x: 0, y: 0 },
    statuses: [
      { layout: { x: 0, y: 0 }, statusReference: 'ref-1' },
      { layout: { x: 0, y: 60 }, statusReference: 'ref-2' },
    ],
    transitions: [
      { conditions: { operation: 'ALL' }, id: '10', name: 'To Do', toStatusReference: 'ref-1', type: 'GLOBAL' },
      { conditions: { operation: 'ALL' }, id: '20', name: 'Done', toStatusReference: 'ref-2', type: 'GLOBAL' },
    ],
    version: { id: 'version-1', versionNumber: 1 },
  };
}

// endregion | Helpers
