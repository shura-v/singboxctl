import { spawn } from "node:child_process";
import { FriendlyMessageError } from "./cli.js";

export type CommandResult = {
  code: number;
  stderr: string;
  stdout: string;
};

export async function runCommandCapture(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new FriendlyMessageError(`Failed to start "${command}". Make sure it is installed and available in PATH.`)
      );
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stderr,
        stdout
      });
    });
  });
}

export async function runCommandStreaming(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", () => {
      reject(
        new FriendlyMessageError(`Failed to start "${command}". Make sure it is installed and available in PATH.`)
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new FriendlyMessageError(`Command failed: ${command} ${args.join(" ")}`));
    });
  });
}

