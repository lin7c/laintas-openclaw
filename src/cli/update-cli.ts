import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
export type {
  UpdateCommandOptions,
  UpdateFinalizeOptions,
  UpdateStatusOptions,
  UpdateWizardOptions,
} from "./update-cli/shared.js";

/** Message shown for every self-update path in the laintas-openclaw fork. */
export const LAINTAS_MANAGED_UPDATE_MESSAGE =
  "laintas-openclaw is a Laintas-maintained fork of OpenClaw. " +
  "Self-update is disabled: upstream OpenClaw releases are not applied automatically. " +
  "Install a new laintas-openclaw build from Laintas to update.";

/**
 * Registers the `update` command as a stub. The upstream implementation
 * fetches and installs OpenClaw releases from npm/git, which would replace
 * this fork with upstream builds, so every update subcommand reports that
 * updates are managed by Laintas instead.
 */
export function registerUpdateCli(program: Command) {
  program
    .command("update")
    .description("Disabled in laintas-openclaw (updates are managed by Laintas)")
    .argument("[args...]", "Ignored")
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .action(() => {
      defaultRuntime.log(LAINTAS_MANAGED_UPDATE_MESSAGE);
    });
}
