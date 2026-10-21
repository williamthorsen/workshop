/** @noformat -- @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.42.0";


// .readyup/kits/preflight.ts
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { defineRdyKit } from "readyup";
var preflight_default = defineRdyKit({
  checklists: [
    {
      name: "preflight",
      checks: [
        {
          name: "Docker daemon is running",
          check: () => spawnSync("docker", ["info"]).status === 0,
          fix: "Start Docker, then run the checks again"
        },
        {
          name: "API is listening on port 3000",
          severity: "warn",
          check: async () => {
            const open = await portAccepts(3e3);
            if (!open) return { ok: false, detail: "Nothing is listening on port 3000" };
            return true;
          },
          fix: "Start the API with pnpm dev before the smoke test"
        }
      ]
    }
  ]
});
function portAccepts(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
export {
  preflight_default as default
};
