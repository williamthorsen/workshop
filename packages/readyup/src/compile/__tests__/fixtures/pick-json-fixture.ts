import { pickJson } from '../../../json-projection/pickJson.ts';

export const metadata = pickJson('./fixture-data.json', ['name', 'version']);
