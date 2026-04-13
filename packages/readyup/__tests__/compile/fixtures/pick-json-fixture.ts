import { pickJson } from '../../../src/compile/pickJson.ts';

export const metadata = pickJson('./fixture-data.json', ['name', 'version']);
